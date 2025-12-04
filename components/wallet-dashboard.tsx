"use client"

import { useState, useEffect } from "react"
import {
  X,
  Home,
  Wallet,
  FileText,
  User,
  Settings,
  LogOut,
  TrendingUp,
  Receipt,
  CheckCircle,
  Clock,
  XCircle,
} from "lucide-react"
import { auth, db } from "@/lib/firebase"
import {
  collection,
  addDoc,
  getDoc,
  updateDoc,
  doc,
  query,
  setDoc,
  increment,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore"
import { MatchStatusIndicator } from "@/components/match-status-indicator"
import { callPaymentAPI, pollPaymentStatus } from "@/lib/payment-api"

interface WalletDashboardProps {
  onClose: () => void
}

interface PlacedBet {
  id: string
  betId: string
  status: "pending" | "won" | "lost"
  totalStake: number
  potentialReturns: number
  selections: number
  timestamp: number
  matches: any[]
  userId: string
}

function BetStatusIndicator({ status }: { status: string }) {
  const getStatusIcon = () => {
    switch (status) {
      case "won":
        return <CheckCircle className="w-5 h-5 text-green-400" />
      case "lost":
        return <XCircle className="w-5 h-5 text-red-400" />
      case "pending":
      default:
        return <Clock className="w-5 h-5 text-yellow-400" />
    }
  }

  return getStatusIcon()
}

export default function WalletDashboard({ onClose }: WalletDashboardProps) {
  const [activeTab, setActiveTab] = useState("Home")
  const [user, setUser] = useState<any>(null)
  const [balance, setBalance] = useState(0)
  const [bets, setBets] = useState<PlacedBet[]>([])
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [selectedBet, setSelectedBet] = useState<PlacedBet | null>(null)
  const [depositAmountValue, setDepositAmountValue] = useState("")
  const [withdrawAmountValue, setWithdrawAmountValue] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("mtn")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<string>("")

  useEffect(() => {
    if (!auth.currentUser) return

    const unsubscribeBets = onSnapshot(
      query(collection(db, "users", auth.currentUser.uid, "bets"), orderBy("timestamp", "desc"), limit(50)),
      async (snapshot) => {
        console.log("[v0] Fetching bets, snapshot size:", snapshot.size)
        const betsData: PlacedBet[] = []

        for (const betDoc of snapshot.docs) {
          const betInfo = betDoc.data()
          console.log("[v0] Processing bet:", betDoc.id, betInfo)

          if (!betInfo.matches || !Array.isArray(betInfo.matches) || betInfo.matches.length === 0) {
            console.warn("[v0] Bet has no matches or invalid matches array:", betDoc.id, {
              matchesExists: !!betInfo.matches,
              isArray: Array.isArray(betInfo.matches),
              length: betInfo.matches?.length,
            })
            // Still include the bet but with empty matches
          }

          const selectionsCount =
            betInfo.selections !== undefined ? Number(betInfo.selections) : betInfo.matches?.length || 0

          const mappedBet: PlacedBet = {
            id: betDoc.id,
            betId: betInfo.betId || `BET${String(betsData.length + 1).padStart(6, "0")}`, // Use stored betId if available
            status: betInfo.status || "pending",
            timestamp: betInfo.timestamp,
            totalStake: betInfo.totalStake || 0,
            potentialReturns: betInfo.potentialReturns || 0,
            selections: selectionsCount,
            matches: Array.isArray(betInfo.matches) ? betInfo.matches : [], // Ensure matches is always an array
            userId: betInfo.userId, // Include userId for bet updates
          }

          console.log("[v0] Mapped bet:", mappedBet)

          if (mappedBet.status === "won" && !betInfo.winningsCredited) {
            try {
              const userDoc = await getDoc(doc(db, "users", auth.currentUser!.uid))
              const currentBalance = userDoc.data()?.balance || 0
              const winnings = mappedBet.potentialReturns

              // Credit the full potential returns (stake + profit) to balance
              await updateDoc(doc(db, "users", auth.currentUser!.uid), {
                balance: increment(winnings),
                updatedAt: new Date(),
              })

              // Mark winnings as credited in bet document
              await updateDoc(betDoc.ref, {
                winningsCredited: true,
                winningsAmount: winnings,
                winningsCreditedAt: new Date(),
              })

              console.log("[v0] Winnings credited:", { betId: mappedBet.betId, amount: winnings })

              await addDoc(collection(db, "users", auth.currentUser!.uid, "transactions"), {
                userId: auth.currentUser!.uid,
                betId: betDoc.id,
                type: "winnings",
                amount: winnings,
                description: `Winnings from bet ${mappedBet.betId}`,
                status: "completed",
                timestamp: new Date(),
                expiresAt: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000), // Set expiration to 5 years
              })
            } catch (error) {
              console.error("[v0] Error crediting winnings:", error)
            }
          }

          betsData.push(mappedBet)
        }

        console.log("[v0] Total bets loaded:", betsData.length)
        setBets(betsData)
      },
      (error) => {
        console.error("[v0] Error loading bets:", error)
        alert("Failed to load bets. Please refresh the page.")
      },
    )

    const unsubscribeBalance = onSnapshot(
      doc(db, "users", auth.currentUser.uid),
      (doc) => {
        if (doc.exists()) {
          setBalance(doc.data().balance || 0)
        }
      },
      (error) => {
        console.error("[v0] Error loading balance:", error)
      },
    )

    return () => {
      unsubscribeBalance()
      unsubscribeBets()
    }
  }, [])

  const handleLogout = async () => {
    await auth.signOut()
    onClose()
  }

  const handleDeposit = async () => {
    const depositAmount = Number.parseInt(depositAmountValue)
    if (!depositAmountValue || depositAmount < 500 || depositAmount > 10000000) {
      alert("Deposit must be between UGX 500 and UGX 10,000,000")
      return
    }

    if (!phoneNumber) {
      alert("Please enter your phone number")
      return
    }

    try {
      setIsProcessing(true)
      setPaymentStatus("Initiating payment...")

      const depositId = `DEP${Date.now()}`

      const paymentResult = await callPaymentAPI("/api/deposit", {
        msisdn: phoneNumber,
        amount: depositAmount,
        description: `Deposit for betting account - ${depositId}`,
      })

      console.log("[v0] Deposit API response:", paymentResult)

      if (!paymentResult.internal_reference && !paymentResult.relworx?.message?.includes("in progress")) {
        throw new Error(paymentResult.relworx?.message || paymentResult.message || "Failed to initiate payment")
      }

      setPaymentStatus("Processing payment... Please confirm on your phone")
      const finalStatus = await pollPaymentStatus(
        paymentResult.internal_reference || paymentResult.relworx?.internal_reference,
        30,
        2000,
        (status) => {
          console.log("[v0] Poll update:", status)
          const statusMessage = status.relworx?.message || status.message || "processing"
          setPaymentStatus(`Payment status: ${statusMessage}`)
        },
      )

      console.log("[v0] Final payment status:", finalStatus)

      if (
        finalStatus.status === "success" &&
        finalStatus.request_status === "success" &&
        finalStatus.provider_transaction_id
      ) {
        const userDocRef = doc(db, "users", auth.currentUser!.uid)
        const userDoc = await getDoc(userDocRef)

        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            userId: auth.currentUser!.uid,
            balance: depositAmount,
            phoneNumber: phoneNumber,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        } else {
          await updateDoc(userDocRef, {
            balance: increment(depositAmount),
            phoneNumber: phoneNumber,
            updatedAt: new Date(),
          })
        }

        const depositData = {
          userId: auth.currentUser!.uid,
          depositId: depositId,
          amount: depositAmount,
          method: paymentMethod,
          phoneNumber: phoneNumber,
          status: "completed",
          internalReference: finalStatus.internal_reference || "",
          customerReference: finalStatus.customer_reference || "",
          provider: finalStatus.provider || paymentMethod,
          providerTransactionId: finalStatus.provider_transaction_id || "",
          charge: finalStatus.charge || 0,
          completedAt: finalStatus.completed_at || new Date().toISOString(),
          timestamp: new Date(),
        }

        console.log("[v0] Saving deposit data:", depositData)
        await addDoc(collection(db, "users", auth.currentUser!.uid, "deposits"), depositData)

        await addDoc(collection(db, "users", auth.currentUser!.uid, "transactions"), {
          userId: auth.currentUser!.uid,
          type: "deposit",
          amount: depositAmount,
          method: paymentMethod,
          description: `Deposit via ${paymentMethod.toUpperCase()} - ${finalStatus.provider || ""}`,
          status: "completed",
          provider: finalStatus.provider || paymentMethod,
          timestamp: new Date(),
        })

        setDepositAmountValue("")
        setPaymentStatus("")
        alert(
          `Deposit of UGX ${depositAmount.toLocaleString()} completed!\nDeposit ID: ${depositId}\nTransaction: ${finalStatus.provider_transaction_id || "pending"}`,
        )
      } else {
        throw new Error("Payment processing failed. Please try again.")
      }
    } catch (error) {
      console.error("[v0] Error processing deposit:", error)
      alert(`Error: ${error instanceof Error ? error.message : "Payment failed"}`)
    } finally {
      setIsProcessing(false)
      setPaymentStatus("")
    }
  }

  const handleWithdraw = async () => {
    const withdrawAmount = Number.parseInt(withdrawAmountValue)

    if (!withdrawAmountValue || withdrawAmount < 500 || withdrawAmount > 10000000) {
      alert("Withdrawal must be between UGX 500 and UGX 10,000,000")
      return
    }

    if (withdrawAmount > balance) {
      alert(`Insufficient balance. Your balance: UGX ${balance.toLocaleString()}`)
      return
    }

    if (!phoneNumber) {
      alert("Please enter your phone number")
      return
    }

    try {
      setIsProcessing(true)
      setPaymentStatus("Initiating withdrawal...")

      // Deduct balance immediately
      await updateDoc(doc(db, "users", auth.currentUser!.uid), {
        balance: increment(-withdrawAmount),
      })

      const withdrawalId = `WD${Date.now()}`

      const paymentResult = await callPaymentAPI("/api/withdraw", {
        msisdn: phoneNumber,
        amount: withdrawAmount,
        description: `Withdrawal from betting account - ${withdrawalId}`,
      })

      console.log("[v0] Withdraw API response:", paymentResult)

      if (!paymentResult.internal_reference && !paymentResult.relworx?.message?.includes("in progress")) {
        // Refund balance on failure
        await updateDoc(doc(db, "users", auth.currentUser!.uid), {
          balance: increment(withdrawAmount),
        })
        throw new Error(paymentResult.relworx?.message || paymentResult.message || "Failed to initiate withdrawal")
      }

      setPaymentStatus("Processing withdrawal... Please wait")
      const finalStatus = await pollPaymentStatus(
        paymentResult.internal_reference || paymentResult.relworx?.internal_reference,
        30,
        2000,
        (status) => {
          console.log("[v0] Poll update:", status)
          setPaymentStatus(`Withdrawal status: ${status.request_status || status.status || "processing"}`)
        },
      )

      console.log("[v0] Final withdrawal status:", finalStatus)

      // Check multiple status indicators for successful withdrawal
      if (
        finalStatus.success === true ||
        finalStatus.status === "success" ||
        finalStatus.request_status === "success" ||
        finalStatus.provider_transaction_id
      ) {
        const withdrawalData = {
          userId: auth.currentUser!.uid,
          withdrawalId: withdrawalId,
          amount: withdrawAmount,
          method: paymentMethod,
          phoneNumber: phoneNumber,
          status: "completed",
          internalReference: finalStatus.internal_reference || "",
          customerReference: finalStatus.customer_reference || "",
          provider: finalStatus.provider || paymentMethod,
          providerTransactionId: finalStatus.provider_transaction_id || "",
          charge: finalStatus.charge || 0,
          completedAt: finalStatus.completed_at || new Date().toISOString(),
          timestamp: new Date(),
        }

        console.log("[v0] Saving withdrawal data:", withdrawalData)
        await addDoc(collection(db, "users", auth.currentUser!.uid, "withdrawals"), withdrawalData)

        await addDoc(collection(db, "users", auth.currentUser!.uid, "transactions"), {
          userId: auth.currentUser!.uid,
          type: "withdrawal",
          amount: withdrawAmount,
          method: paymentMethod,
          description: `Withdrawal via ${paymentMethod.toUpperCase()} - ${finalStatus.provider || ""}`,
          status: "completed",
          provider: finalStatus.provider || paymentMethod,
          timestamp: new Date(),
        })

        setWithdrawAmountValue("")
        setPaymentStatus("")
        alert(
          `Withdrawal of UGX ${withdrawAmount.toLocaleString()} completed!\nWithdrawal ID: ${withdrawalId}\nTransaction: ${finalStatus.provider_transaction_id || "pending"}`,
        )
      } else {
        // Refund balance if withdrawal failed
        await updateDoc(doc(db, "users", auth.currentUser!.uid), {
          balance: increment(withdrawAmount),
        })
        throw new Error("Withdrawal processing failed. Balance has been refunded.")
      }
    } catch (error) {
      console.error("[v0] Error processing withdrawal:", error)
      alert(`Error: ${error instanceof Error ? error.message : "Withdrawal failed"}`)
    } finally {
      setIsProcessing(false)
      setPaymentStatus("")
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "won":
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case "lost":
        return <XCircle className="w-5 h-5 text-red-500" />
      case "pending":
      default:
        return <Clock className="w-5 h-5 text-yellow-500" />
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0a0a0a] rounded-2xl w-full max-w-7xl h-[90vh] flex overflow-hidden shadow-2xl">
        {/* ... existing sidebar ... */}
        <div className="w-64 bg-black border-r border-gray-800 flex flex-col">
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-2 text-purple-500">
              <Wallet className="w-6 h-6" />
              <h2 className="text-lg font-bold">Wallet Dashboard</h2>
            </div>
          </div>

          <nav className="flex-1 p-4">
            {[
              { name: "Home", icon: Home },
              { name: "My Bets", icon: FileText },
              { name: "Wallet", icon: Wallet },
              { name: "Withdrawals", icon: Receipt },
              { name: "Profile", icon: User },
              { name: "Setting", icon: Settings },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.name}
                  onClick={() => {
                    setActiveTab(item.name)
                    setSelectedBet(null)
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                    activeTab === item.name
                      ? "bg-purple-600 text-white"
                      : "text-gray-400 hover:bg-gray-900 hover:text-white"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm">{item.name}</span>
                </button>
              )
            })}
          </nav>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-8 py-4 text-gray-400 hover:text-white bg-gray-900 px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Logout</span>
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl text-white font-bold">{selectedBet ? `Bet #${selectedBet.betId}` : activeTab}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white bg-gray-900 px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ... existing Home, Wallet, Withdrawals, Profile, Setting tabs ... */}
          {activeTab === "Home" && (
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-semibold">Balance</h4>
                  <Wallet className="w-6 h-6 text-purple-200" />
                </div>
                <p className="text-3xl font-bold text-white">UGX {balance.toLocaleString()}</p>
              </div>

              <div className="bg-gradient-to-br from-cyan-600 to-cyan-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-semibold">Total Bets</h4>
                  <FileText className="w-6 h-6 text-cyan-200" />
                </div>
                <p className="text-3xl font-bold text-white">{bets.length}</p>
              </div>

              <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-semibold">Won Bets</h4>
                  <CheckCircle className="w-6 h-6 text-green-200" />
                </div>
                <p className="text-3xl font-bold text-white">{bets.filter((b) => b.status === "won").length}</p>
              </div>
            </div>
          )}

          {activeTab === "My Bets" && !selectedBet && (
            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Bet ID</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Selections</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Total Stake</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Potential Returns</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Status</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bets.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          No bets placed yet
                        </td>
                      </tr>
                    ) : (
                      bets.map((bet) => (
                        <tr key={bet.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                          <td className="px-6 py-4 text-sm text-white font-semibold">#{bet.betId}</td>
                          <td className="px-6 py-4 text-sm text-gray-300">{bet.selections}</td>
                          <td className="px-6 py-4 text-sm text-white">UGX {bet.totalStake.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-cyan-400 font-semibold">
                            UGX {bet.potentialReturns.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <div className="flex items-center gap-2">
                              <BetStatusIndicator status={bet.status} />
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                  bet.status === "won"
                                    ? "bg-green-900/30 text-green-400"
                                    : bet.status === "lost"
                                      ? "bg-red-900/30 text-red-400"
                                      : "bg-yellow-900/30 text-yellow-400"
                                }`}
                              >
                                {bet.status.toUpperCase()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <button
                              onClick={() => setSelectedBet(bet)}
                              className="text-purple-400 hover:text-purple-300 font-semibold transition-colors"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "My Bets" && selectedBet && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Status</p>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedBet.status)}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        selectedBet.status === "won"
                          ? "bg-green-900/30 text-green-400"
                          : selectedBet.status === "lost"
                            ? "bg-red-900/30 text-red-400"
                            : "bg-yellow-900/30 text-yellow-400"
                      }`}
                    >
                      {selectedBet.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Total Stake</p>
                  <p className="text-white font-bold text-lg">UGX {selectedBet.totalStake.toLocaleString()}</p>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Potential Returns</p>
                  <p className="text-cyan-400 font-bold text-lg">UGX {selectedBet.potentialReturns.toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl p-6">
                <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" /> Bet Selections ({selectedBet.matches?.length || 0})
                </h4>
                <div className="space-y-3">
                  {selectedBet.matches && selectedBet.matches.length > 0 ? (
                    selectedBet.matches.map((match: any, idx: number) => (
                      <div key={idx} className="bg-gray-800 rounded-lg p-4 flex justify-between items-center">
                        <div className="flex items-center gap-3 flex-1">
                          <div>
                            <p className="text-white font-medium">
                              {match.homeTeam || "Unknown"} vs {match.awayTeam || "Unknown"}
                            </p>
                            <p className="text-gray-400 text-sm">Odd Type: {match.oddType || "N/A"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <MatchStatusIndicator
                            matchId={match.matchId}
                            oddType={match.oddType}
                            homeTeamGoals={match.homeTeamGoals}
                            awayTeamGoals={match.awayTeamGoals}
                            betId={selectedBet.id}
                            userId={auth.currentUser?.uid}
                          />
                          <div className="text-right">
                            <p className="text-cyan-400 font-bold text-lg">{match.odd || "N/A"}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-500 p-4 bg-gray-800 rounded-lg text-center">
                      No matches found in this bet. Matches count: {selectedBet.matches?.length || 0}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedBet(null)}
                className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Back to Bets
              </button>
            </div>
          )}

          {activeTab === "Wallet" && (
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-900 rounded-xl p-6">
                <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" /> Deposit
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Amount (UGX)</label>
                    <input
                      type="number"
                      placeholder="Minimum UGX 500"
                      value={depositAmountValue}
                      onChange={(e) => setDepositAmountValue(e.target.value)}
                      className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Payment Method</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none"
                    >
                      <option value="mtn">MTN Mobile Money</option>
                      <option value="airtel">Airtel Money</option>
                      <option value="utl">Uganda Telecom</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+256..."
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleDeposit}
                    disabled={isProcessing}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors"
                  >
                    Deposit Now
                  </button>
                </div>
              </div>

              <div className="bg-gray-900 rounded-xl p-6">
                <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5" /> Withdraw
                </h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Amount (UGX)</label>
                    <input
                      type="number"
                      placeholder="Enter amount"
                      value={withdrawAmountValue}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val && Number(val) > balance) {
                          setWithdrawAmountValue(balance.toString())
                        } else {
                          setWithdrawAmountValue(val)
                        }
                      }}
                      className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Available: UGX {balance.toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-2 block">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+256..."
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-purple-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleWithdraw}
                    disabled={
                      isProcessing ||
                      !withdrawAmountValue ||
                      Number(withdrawAmountValue) < 500 ||
                      Number(withdrawAmountValue) > balance
                    }
                    className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors"
                  >
                    Withdraw Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Withdrawals" && (
            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Date</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Amount</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Method</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                          No withdrawals yet
                        </td>
                      </tr>
                    ) : (
                      withdrawals.map((withdrawal) => (
                        <tr key={withdrawal.id} className="border-b border-gray-800">
                          <td className="px-6 py-4 text-sm text-gray-300">
                            {new Date(withdrawal.timestamp).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-sm text-white">UGX {withdrawal.amount.toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-gray-400">{withdrawal.method}</td>
                          <td className="px-6 py-4 text-sm">
                            <span className="px-2 py-1 bg-green-900 text-green-200 rounded text-xs">
                              {withdrawal.status || "Completed"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "Profile" && (
            <div className="bg-gray-900 rounded-xl p-6">
              <h4 className="text-white font-semibold mb-4">Profile Information</h4>
              <div className="space-y-4">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Full Name</p>
                  <p className="text-white font-medium">{user?.fullName || "Not set"}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Email</p>
                  <p className="text-white font-medium">{user?.email || "Not set"}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Phone Number</p>
                  <p className="text-white font-medium">{user?.phoneNumber || "Not set"}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Setting" && (
            <div className="bg-gray-900 rounded-xl p-6">
              <h4 className="text-white font-semibold mb-4">Settings</h4>
              <p className="text-gray-400">Settings options coming soon</p>
            </div>
          )}
        </div>
      </div>
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-lg text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
            <p className="text-white mb-2">Processing Payment...</p>
            <p className="text-gray-400 text-sm">{paymentStatus}</p>
          </div>
        </div>
      )}
    </div>
  )
}
