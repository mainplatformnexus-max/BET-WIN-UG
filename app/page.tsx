"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronRight, Star, Info, BarChart3, User, CreditCard } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { MatchDetailsModal } from "@/components/match-details-modal"
import { AuthModal } from "@/components/auth-modal"
import WalletDashboard from "@/components/wallet-dashboard"
import { auth } from "@/lib/firebase"
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth"
// Import necessary Firestore functions
import { db } from "@/lib/firebase"
import { doc, getDoc, collection, addDoc, updateDoc } from "firebase/firestore"

interface Match {
  id: number
  sr_id: string
  info_static: {
    competitor_home: {
      name: { en: string }
      logo_url: string
    }
    competitor_away: {
      name: { en: string }
      logo_url: string
    }
    start_time: number
    tournament: {
      name: { en: string }
      logo_url: string
    }
    category: {
      country_code: string
    }
  }
  odds: {
    sr1: {
      [key: string]: {
        [marketId: string]: {
          sp: {
            [key: string]: {
              out: {
                [outcomeId: string]: {
                  o: string
                }
              }
            }
          }
        }
      }
    }
  }
  // Added new fields for top league matches
  home_team: { logo: string; abbr: string; name: string }
  away_team: { logo: string; abbr: string; name: string }
  start_date: number
  // Fields for live matches
  info_dynamic?: {
    score: { h: string; a: string }
    clock?: { event_time: string }
    competition_status?: { name: { en: string } }
  }
}

interface MatchesResponse {
  matches: Match[]
}

interface BetSlipItem {
  matchId: number
  matchName: string
  homeTeam: string
  awayTeam: string
  odd: string
  oddType: string
  checked: boolean
}

export default function BettingPage() {
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null) // Changed from "top-games" to null
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null) // Renamed from selectedMatch
  const [topLeagueMatches, setTopLeagueMatches] = useState<{
    premierLeague: Match | null
    laLiga: Match | null
    serieA: Match | null
    bundesliga: Match | null
  }>({
    premierLeague: null,
    laLiga: null,
    serieA: null,
    bundesliga: null,
  })
  const [betSlip, setBetSlip] = useState<BetSlipItem[]>([])
  const [stake, setStake] = useState("1000") // Default stake to 1000

  const [liveMatches, setLiveMatches] = useState<any[]>([])
  const [isInitialLiveLoad, setIsInitialLiveLoad] = useState(true)

  const [loadingLive, setLoadingLive] = useState(true)

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login")
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null)

  const [userBalance, setUserBalance] = useState(0)
  const [showWalletDashboard, setShowWalletDashboard] = useState(false) // Renamed from showAccountPage

  const leagueTournamentIds: { [key: string]: number } = {
    "Premier League": 663,
    Bundesliga: 599,
    "Serie A": 576,
    LaLiga: 626,
  }

  // Fetch matches
  useEffect(() => {
    const fetchTopLeagueMatches = async () => {
      try {
        // Fetch 1 match from each league
        const [premierLeagueRes, laLigaRes, serieARes, bundesligaRes] = await Promise.all([
          fetch("/api/matches?tournament_id=663"), // Premier League
          fetch("/api/matches?tournament_id=626"), // LaLiga
          fetch("/api/matches?tournament_id=576"), // Serie A
          fetch("/api/matches?tournament_id=599"), // Bundesliga
        ])

        const [premierLeagueData, laLigaData, serieAData, bundesligaData] = await Promise.all([
          premierLeagueRes.json(),
          laLigaRes.json(),
          serieARes.json(),
          bundesligaRes.json(),
        ])

        setTopLeagueMatches({
          premierLeague: premierLeagueData.matches?.[0] || null,
          laLiga: laLigaData.matches?.[0] || null,
          serieA: serieAData.matches?.[0] || null,
          bundesliga: bundesligaData.matches?.[0] || null,
        })
      } catch (error) {
        console.error("[v0] Error fetching top league matches:", error)
      }
    }

    fetchTopLeagueMatches()
  }, [])

  const [topScorers, setTopScorers] = useState<any[]>([])
  useEffect(() => {
    const fetchTopScorers = async () => {
      try {
        const response = await fetch(
          "https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v3/competitions/8/seasons/2025/players/stats/leaderboard?_sort=goals%3Adesc&_limit=5",
        )
        const data = await response.json()
        if (data.data) {
          setTopScorers(data.data.slice(0, 5))
        }
      } catch (error) {
        console.error("[v0] Error fetching top scorers:", error)
      }
    }

    fetchTopScorers()
  }, [])

  useEffect(() => {
    const fetchLiveMatches = async () => {
      try {
        if (isInitialLiveLoad) {
          setLoadingLive(true)
        }
        const response = await fetch("/api/live-matches")
        const data = await response.json()
        if (data.matches) {
          setLiveMatches((prevMatches) => {
            if (isInitialLiveLoad) {
              setIsInitialLiveLoad(false)
              return data.matches
            }

            if (prevMatches.length === 0) {
              return data.matches
            }

            // Create a map of new data by match ID
            const newDataMap = new Map(data.matches.map((m: any) => [m.id, m]))
            const updatedMatches = []

            // Update existing matches with new odds, minutes, and scores
            for (const prevMatch of prevMatches) {
              const newData = newDataMap.get(prevMatch.id)
              if (newData) {
                // Match still live - update odds, time, and scores
                updatedMatches.push({
                  ...prevMatch,
                  odds: newData.odds,
                  info_dynamic: newData.info_dynamic,
                  info_static: newData.info_static,
                })
                newDataMap.delete(prevMatch.id) // Mark as processed
              }
              // If newData doesn't exist, match is finished - don't include it (remove completed)
            }

            // Add any new matches that weren't in the previous list
            newDataMap.forEach((newMatch) => {
              updatedMatches.push(newMatch)
            })

            return updatedMatches
          })
        }
      } catch (error) {
        console.error("Failed to fetch live matches:", error)
      } finally {
        if (isInitialLiveLoad) {
          setLoadingLive(false)
        }
      }
    }

    fetchLiveMatches()
    const interval = setInterval(fetchLiveMatches, 3000) // Update every 3 seconds

    return () => clearInterval(interval)
  }, [isInitialLiveLoad])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      if (user) {
        const userDoc = doc(db, "users", user.uid)
        getDoc(userDoc).then((docSnap) => {
          if (docSnap.exists()) {
            setUserBalance(docSnap.data().balance || 0)
          }
        })
      } else {
        setUserBalance(0)
      }
    })
    return () => unsubscribe()
  }, [])

  const handleLogout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const fetchLeagueMatches = async (tournamentId: number, leagueName: string) => {
    setIsLoading(true)
    setSelectedLeague(leagueName)

    try {
      const response = await fetch(`/api/matches?tournament_id=${tournamentId}`)
      const data: MatchesResponse = await response.json()
      console.log("[v0] Fetched matches:", data.matches?.length || 0)
      setMatches(data.matches || [])
    } catch (error) {
      console.error("[v0] Error fetching matches:", error)
      setMatches([])
    } finally {
      setIsLoading(false)
    }
  }

  const getMatchOdds = (match: Match) => {
    try {
      const market1 = match.odds?.sr1?.["3"]?.["1"]?.sp?.["_"]?.out
      if (market1) {
        return {
          home: market1["1"]?.o || "-",
          draw: market1["2"]?.o || "-",
          away: market1["3"]?.o || "-",
        }
      }
    } catch (e) {
      console.error("[v0] Error parsing odds:", e)
    }
    return { home: "-", draw: "-", away: "-" }
  }

  const getMatchAllOdds = (match: Match) => {
    try {
      const markets = match.odds?.sr1?.["3"]
      if (markets) {
        const market1 = markets["1"]?.sp?.["_"]?.out // 1X2
        const market10 = markets["10"]?.sp?.["_"]?.out // Double Chance (1X, X2, 12)

        return {
          home: market1?.["1"]?.o || "-",
          draw: market1?.["2"]?.o || "-",
          away: market1?.["3"]?.o || "-",
          homeOrDraw: market10?.["9"]?.o || "-", // 1X
          drawOrAway: market10?.["10"]?.o || "-", // X2
          homeOrAway: market10?.["11"]?.o || "-", // 12
        }
      }
    } catch (e) {
      console.error("[v0] Error parsing all odds:", e)
    }
    return { home: "-", draw: "-", away: "-", homeOrDraw: "-", drawOrAway: "-", homeOrAway: "-" }
  }

  const formatMatchTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return {
      date: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }),
      time: date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }),
    }
  }

  const formatLiveTime = (eventTime: string) => {
    // eventTime comes as "MM:SS" or similar format
    const parts = eventTime.split(":")
    if (parts.length >= 1) {
      const minutes = Number.parseInt(parts[0])
      return `${minutes}'`
    }
    return eventTime
  }

  const toggleOddToBetSlip = (matchId: number, homeTeam: string, awayTeam: string, odd: string, oddType: string) => {
    const checkedBets = betSlip.filter((bet) => bet.checked)
    const currentTotalOdds = checkedBets.reduce((acc, bet) => acc * Number.parseFloat(bet.odd), 1)
    const newTotalOdds = currentTotalOdds * Number.parseFloat(odd)

    if (newTotalOdds > 1000) {
      alert("Cannot add more selections. Maximum odds limit (1000) would be exceeded.")
      return
    }

    const existingBet = betSlip.find((bet) => bet.matchId === matchId && bet.oddType === oddType)

    if (existingBet) {
      // Remove if already exists
      setBetSlip(betSlip.filter((bet) => !(bet.matchId === matchId && bet.oddType === oddType)))
    } else {
      // Add new bet
      setBetSlip([
        ...betSlip,
        {
          matchId,
          matchName: `${homeTeam} vs ${awayTeam}`,
          homeTeam,
          awayTeam,
          odd,
          oddType,
          checked: true,
        },
      ])
    }
  }

  const isOddSelected = (matchId: number, oddType: string) => {
    return betSlip.some((bet) => bet.matchId === matchId && bet.oddType === oddType)
  }

  const getBestOdd = (odds: string[]) => {
    return Math.max(...odds.map((o) => Number.parseFloat(o)))
  }

  const totalOdds = betSlip
    .filter((item) => item.checked)
    .reduce((acc, item) => acc * Number.parseFloat(item.odd), 1)
    .toFixed(2)

  const potentialReturn = (Number.parseFloat(stake) * Number.parseFloat(totalOdds)).toFixed(2)

  const handlePlaceBet = async () => {
    try {
      console.log("[v0] Starting bet placement...")
      console.log("[v0] Current betSlip:", betSlip)

      const checkedBets = betSlip.filter((b) => b.checked)
      console.log("[v0] Checked bets:", checkedBets)

      if (checkedBets.length === 0) {
        alert("Please select at least one bet")
        return
      }

      if (!currentUser) {
        setAuthModalOpen(true)
        return
      }

      const stakeAmount = Number.parseFloat(stake)
      if (stakeAmount < 1 || stakeAmount > 10000000) {
        alert("Stake must be between UGX 1 and UGX 10,000,000")
        return
      }

      const userDoc = await getDoc(doc(db, "users", currentUser.uid))
      const currentBalance = userDoc.data()?.balance || 0

      if (stakeAmount > currentBalance) {
        alert(`Insufficient balance. Your balance: UGX ${currentBalance.toLocaleString()}`)
        return
      }

      const totalOdds = checkedBets.reduce((acc, bet) => acc * Number.parseFloat(bet.odd), 1)

      if (totalOdds > 1000) {
        alert("Total odds cannot exceed 1000")
        return
      }

      const betIdNumber = Date.now()
      const betId = `BET${betIdNumber}`

      const betData = {
        betId: betId, // Add unique bet ID
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        matches: checkedBets.map((b) => ({
          matchId: b.matchId,
          matchName: b.matchName,
          homeTeam: b.homeTeam,
          awayTeam: b.awayTeam,
          oddType: b.oddType,
          odd: b.odd,
          oddValue: Number.parseFloat(b.odd),
          matchStatus: "pending", // Track individual match status
        })),
        totalOdds: Number(totalOdds.toFixed(2)),
        totalStake: stakeAmount,
        potentialReturns: Number.parseFloat(potentialReturn),
        selections: checkedBets.length,
        status: "pending",
        winningsCredited: false,
        timestamp: new Date(),
        createdAt: new Date(), // Add creation timestamp
        updatedAt: new Date(),
        lastCheckedAt: null, // Track when bet was last checked for status
        expiresAt: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000), // Set expiration to 5 years
        version: 1, // Add version for future schema changes
      }

      console.log("[v0] Bet data to save:", betData)

      const betDocRef = await addDoc(collection(db, "users", currentUser.uid, "bets"), betData)
      console.log("[v0] Bet saved with ID:", betDocRef.id)

      const newBalance = currentBalance - stakeAmount
      await updateDoc(doc(db, "users", currentUser.uid), {
        balance: newBalance,
        updatedAt: new Date(),
      })
      console.log("[v0] Balance updated to:", newBalance)

      await addDoc(collection(db, "users", currentUser.uid, "transactions"), {
        userId: currentUser.uid,
        betId: betDocRef.id,
        type: "bet",
        amount: stakeAmount,
        description: `Bet placed: ${checkedBets.length} selection(s) - Total odds: ${totalOdds.toFixed(2)}`,
        status: "completed",
        timestamp: new Date(),
        expiresAt: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000), // Set expiration to 5 years
      })
      console.log("[v0] Transaction record created")

      setUserBalance(newBalance)

      setBetSlip([])
      setStake("1000")

      alert(`Bet placed successfully!\nBet ID: ${betId}\nNew balance: UGX ${newBalance.toLocaleString()}`)
    } catch (error) {
      console.error("[v0] Error placing bet:", error)
      alert("Failed to place bet. Please try again.")
    }
  }

  // Renamed from currentUserBalance to userBalance for consistency
  const currentUserBalance = userBalance

  return (
    <div className="min-h-screen bg-[#0a1628] text-white font-sans">
      {/* Header */}
      <header className="h-14 bg-[#0f1c33] border-b border-[#1a2942] flex items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <div className="text-xl font-bold">
            <span className="text-white">BET</span>
            <span className="text-[#d946ef]">WIN.</span>
          </div>

          <nav className="hidden lg:flex items-center gap-1 text-xs">
            {[
              { icon: "🎯", label: "BETTING" },
              { icon: "📡", label: "LIVE" },
              { icon: "🎰", label: "LIVE CASINO" },
              { icon: "🎲", label: "CASINO", active: true },
              { icon: "🎮", label: "VIRTUAL" },
              { icon: "✈️", label: "AVIATOR" },
              { icon: "⚡", label: "ONWINX" },
              { icon: "🎪", label: "GAMES" },
              { icon: "🎯", label: "FAIRPLAY" },
              { icon: "🎱", label: "BINGO" },
              { icon: "🏆", label: "ESPORTS" },
              { icon: "🎁", label: "PROMOTIONS" },
            ].map((item, i) => (
              <button
                key={i}
                className={`px-2 py-1.5 rounded transition-colors ${
                  item.active ? "bg-[#d946ef] text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {currentUser ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowWalletDashboard(true)}
                className="text-xs h-7 px-3 text-green-400 hover:text-green-300 font-medium"
              >
                <CreditCard className="w-3 h-3 mr-1" />
                UGX {userBalance.toLocaleString()}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowWalletDashboard(true)}
                className="text-xs h-7 px-2 hover:text-purple-400 transition-colors"
              >
                <User className="w-3 h-3 mr-1" />
                {currentUser.displayName || currentUser.email}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleLogout}
                className="text-xs h-7 px-3 border-white/20 bg-transparent"
              >
                LOGOUT
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAuthModalTab("register")
                  setAuthModalOpen(true)
                }}
                className="text-xs h-7 px-3 border-white/20 bg-transparent"
              >
                REGISTER +
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setAuthModalTab("login")
                  setAuthModalOpen(true)
                }}
                className="text-xs h-7 px-3 bg-[#fbbf24] text-black hover:bg-[#f59e0b]"
              >
                LOGIN ⭕
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex">
        {/* Left Sidebar */}
        <aside className="w-44 bg-[#0f1c33] border-r border-[#1a2942] overflow-y-auto h-[calc(100vh-60px)] text-xs">
          <div className="p-2 space-y-2">
            {/* Quick Actions */}
            <div className="flex gap-1">
              <Button size="sm" className="flex-1 h-7 text-[10px] bg-[#d946ef] hover:bg-[#c026d3]">
                SPORTS ⚡
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px] border-gray-600 bg-transparent">
                LIVE 📡
              </Button>
            </div>

            {/* Outright & Search */}
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="flex-1 h-6 text-[10px] justify-start">
                ⏱️ Nicosia
              </Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                🔍
              </Button>
            </div>

            {/* Outrights Section */}
            <div className="bg-[#0a1628] rounded p-2">
              <h3 className="text-[10px] font-semibold mb-2 flex items-center justify-between">
                Outrights
                <ChevronRight className="w-3 h-3" />
              </h3>
              <button className="w-full text-left py-1 px-2 hover:bg-[#1a2942] rounded flex items-center text-[10px]">
                ⚽ Soccer
              </button>
            </div>

            {/* Top Championships */}
            <div className="bg-[#0a1628] rounded p-2">
              <h3 className="text-[10px] font-semibold mb-2 flex items-center justify-between">
                Top Championships
                <ChevronRight className="w-3 h-3" />
              </h3>
              <div className="space-y-0.5">
                {[
                  {
                    logo: "https://bmstatic.cloud/bmstorage/uof/tournaments/logos/big/17.png",
                    name: "Premier League",
                    id: 663,
                  },
                  {
                    logo: "https://bmstatic.cloud/bmstorage/uof/tournaments/logos/big/35.png",
                    name: "Bundesliga",
                    id: 599,
                  },
                  {
                    logo: "https://bmstatic.cloud/bmstorage/uof/tournaments/logos/big/23.png",
                    name: "Serie A",
                    id: 576,
                  },
                  {
                    logo: "https://bmstatic.cloud/bmstorage/uof/tournaments/logos/d012a572-073a-4971-85c9-38809159cb11.svg",
                    name: "LaLiga",
                    id: 626,
                  },
                  { logo: "https://flagcdn.com/16x12/fr.png", name: "Liga 1 France", id: 0 },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (item.id > 0) {
                        fetchLeagueMatches(item.id, item.name.toLowerCase().replace(/\s+/g, "-"))
                      }
                    }}
                    className={`w-full text-left py-1 px-2 hover:bg-[#1a2942] rounded flex items-center text-[10px] ${
                      selectedLeague === item.name.toLowerCase().replace(/\s+/g, "-") ? "bg-[#1a2942]" : ""
                    }`}
                  >
                    <img src={item.logo || "/placeholder.svg"} alt="" className="mr-1.5 w-4 h-3 object-contain" />
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Popular Sports */}
            <div className="bg-[#0a1628] rounded p-2">
              <h3 className="text-[10px] font-semibold mb-2 flex items-center justify-between">
                Popular Sports
                <ChevronRight className="w-3 h-3" />
              </h3>
              <div className="space-y-0.5">
                {[
                  { icon: "⚽", name: "Soccer", count: "1029" },
                  { icon: "🏀", name: "Basketball", count: "156" },
                  { icon: "🎾", name: "Tennis", count: "89" },
                ].map((item, i) => (
                  <button
                    key={i}
                    className="w-full text-left py-1 px-2 hover:bg-[#1a2942] rounded flex items-center justify-between text-[10px]"
                  >
                    <span>
                      <span className="mr-1.5">{item.icon}</span>
                      {item.name}
                    </span>
                    <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                      {item.count}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            {/* International */}
            <div className="space-y-0.5 py-2">
              {[
                { flag: "un", name: "World" },
                { flag: "gb", name: "Internacional" },
                { flag: "us", name: "Internacional" },
                { flag: "ar", name: "Internacional South" },
                { flag: "tr", name: "Turkey" },
                { flag: "gb", name: "England" },
                { flag: "es", name: "Spain" },
                { flag: "it", name: "Italy" },
                { flag: "de", name: "Germany" },
                { flag: "fr", name: "France" },
                { flag: "nl", name: "Netherlands" },
                { flag: "tr", name: "Turkey" },
                { flag: "gb", name: "England" },
                { flag: "es", name: "Spain" },
                { flag: "it", name: "Italy" },
                { flag: "de", name: "Germany" },
                { flag: "fr", name: "France" },
              ].map((item, i) => (
                <button
                  key={i}
                  className="w-full text-left py-1 px-2 hover:bg-[#1a2942] rounded flex items-center text-[10px]"
                >
                  <img src={`https://flagcdn.com/16x12/${item.flag}.png`} alt="" className="mr-1.5 w-4 h-3" />
                  {item.name}
                  <ChevronRight className="w-3 h-3 ml-auto" />
                </button>
              ))}
            </div>

            {/* Sports List */}
            <div className="space-y-0.5 border-t border-[#1a2942] pt-2">
              {[
                { icon: "⚽", name: "Soccer" },
                { icon: "🏀", name: "Basketball" },
                { icon: "🎾", name: "Tennis" },
                { icon: "🏒", name: "Ice Hockey" },
                { icon: "🏐", name: "Volleyball" },
                { icon: "🤾", name: "Handball" },
                { icon: "🎱", name: "Snooker" },
                { icon: "🎯", name: "Darts" },
                { icon: "🏑", name: "Bandy" },
                { icon: "🏏", name: "Cricket" },
                { icon: "🏑", name: "Floorball" },
                { icon: "🏸", name: "Badminton" },
                { icon: "⚾", name: "Futsal" },
                { icon: "🏈", name: "American Football" },
                { icon: "🏒", name: "Field Hockey" },
                { icon: "🏉", name: "Rugby" },
                { icon: "🏓", name: "Table Tennis" },
                { icon: "🤽", name: "Water Polo" },
              ].map((item, i) => (
                <button
                  key={i}
                  className="w-full text-left py-1 px-2 hover:bg-[#1a2942] rounded flex items-center justify-between text-[10px]"
                >
                  <span>
                    <span className="mr-1.5">{item.icon}</span>
                    {item.name}
                  </span>
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    1029
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto h-[calc(100vh-60px)]">
          <div className="p-3 space-y-3">
            {/* Hero Banner */}
            <Card className="bg-gradient-to-r from-[#d946ef] to-[#a855f7] border-0 p-4 relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-sm font-semibold mb-1">SPORT</div>
                <h2 className="text-3xl font-black">BETTING</h2>
              </div>
              <img
                src="/two-soccer-players-in-purple-and-white-jerseys.jpg"
                alt="Soccer Players"
                className="absolute right-0 top-0 h-full w-auto object-cover opacity-90"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#d946ef] to-transparent"></div>
            </Card>

            {/* Sports Icons */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {[
                { icon: "⚽", name: "Soccer" },
                { icon: "🏀", name: "Basketball" },
                { icon: "🎾", name: "Tennis" },
                { icon: "🏒", name: "Ice Hockey" },
                { icon: "🏐", name: "Volleyball" },
                { icon: "🤾", name: "Handball" },
                { icon: "🎱", name: "Snooker" },
                { icon: "🎯", name: "Darts" },
                { icon: "🏑", name: "Bandy" },
                { icon: "🏏", name: "Cricket" },
                { icon: "🏑", name: "Floorball" },
              ].map((sport, i) => (
                <button
                  key={i}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-[#1a2942] transition-colors min-w-[60px]"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                      i === 0 ? "bg-gradient-to-br from-purple-500 to-pink-500" : "bg-[#1a2942]"
                    }`}
                  >
                    {sport.icon}
                  </div>
                  <span className="text-[9px] text-gray-400">{sport.name}</span>
                </button>
              ))}
              <button className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1a2942] hover:bg-[#243451]">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Matches Section */}
            <div className="space-y-2">
              {selectedLeague === null ? (
                <>
                  <div className="flex items-center gap-2 bg-[#0f1c33] px-3 py-2 rounded text-xs font-semibold">
                    <span className="text-red-500">🔴</span>
                    <span>⚽ Soccer</span>
                    <span className="text-gray-400">LIVE FOOTBALL</span>
                    <div className="ml-auto flex gap-6 text-[10px] text-gray-400">
                      <span>1</span>
                      <span>X</span>
                      <span>2</span>
                      <span>1x</span>
                      <span>X2</span>
                      <span>12</span>
                    </div>
                  </div>

                  {loadingLive ? (
                    <Card className="bg-[#0f1c33] border-[#1a2942] p-4 text-center">
                      <div className="text-sm text-gray-400">Loading live matches...</div>
                    </Card>
                  ) : liveMatches.length > 0 ? (
                    liveMatches.slice(0, 10).map((match) => {
                      if (!match?.info_static?.competitor_home || !match?.info_static?.competitor_away) {
                        return null
                      }

                      const homeTeam = match.info_static.competitor_home.name?.en || "Home Team"
                      const awayTeam = match.info_static.competitor_away.name?.en || "Away Team"
                      const homeLogo = match.info_static.competitor_home.logo_url
                      const awayLogo = match.info_static.competitor_away.logo_url
                      const homeScore = match.info_dynamic?.score?.h || "0"
                      const awayScore = match.info_dynamic?.score?.a || "0"
                      const eventTime = match.info_dynamic?.clock?.event_time || "0:00"
                      const status = match.info_dynamic?.competition_status?.name?.en || "Live"

                      // Parse odds
                      const odds1X2 = match.odds?.sr1?.["1"]?.["1"]?.sp?.["_"]?.out
                      const oddsDoubleChance = match.odds?.sr1?.["1"]?.["10"]?.sp?.["_"]?.out

                      const odd1 = odds1X2?.["1"]?.o || "-"
                      const oddX = odds1X2?.["2"]?.o || "-"
                      const odd2 = odds1X2?.["3"]?.o || "-"
                      const odd1X = oddsDoubleChance?.["9"]?.o || "-"
                      const oddX2 = oddsDoubleChance?.["11"]?.o || "-"
                      const odd12 = oddsDoubleChance?.["10"]?.o || "-"

                      return (
                        <Card
                          key={match.id}
                          className="bg-[#0f1c33] border-[#1a2942] p-2 cursor-pointer hover:bg-[#152139] transition-colors"
                          onClick={() => setSelectedMatchId(match.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-24 flex-shrink-0">
                              <div className="text-[9px] text-red-500 font-semibold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                                {formatLiveTime(eventTime)}
                              </div>
                              <div className="text-[9px] text-gray-400 mt-0.5">{status}</div>
                            </div>

                            <div className="w-40 flex-shrink-0 flex items-center gap-2">
                              <div className="flex flex-col gap-1">
                                <img src={homeLogo || "/placeholder.svg"} alt="" className="w-4 h-4 object-contain" />
                                <img src={awayLogo || "/placeholder.svg"} alt="" className="w-4 h-4 object-contain" />
                              </div>
                              <div className="flex-1">
                                <div className="text-[11px] font-medium leading-tight flex items-center justify-between">
                                  <span>{homeTeam}</span>
                                  <span className="text-white font-semibold ml-2">{homeScore}</span>
                                </div>
                                <div className="text-[11px] text-gray-300 leading-tight flex items-center justify-between mt-0.5">
                                  <span>{awayTeam}</span>
                                  <span className="text-white font-semibold ml-2">{awayScore}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button className="p-1 hover:bg-[#1a2942] rounded" onClick={(e) => e.stopPropagation()}>
                                <Star className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                              <button className="p-1 hover:bg-[#1a2942] rounded" onClick={(e) => e.stopPropagation()}>
                                <Info className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                              <button
                                className="px-1.5 py-0.5 hover:bg-[#1a2942] rounded text-gray-400 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                +
                              </button>
                              <button className="p-1 hover:bg-[#1a2942] rounded" onClick={(e) => e.stopPropagation()}>
                                <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                            </div>

                            {/* Updated odds button rendering */}
                            <div className="flex gap-1.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                              {[
                                { odd: odd1, type: "1" },
                                { odd: oddX, type: "X" },
                                { odd: odd2, type: "2" },
                                { odd: odd1X, type: "1X" },
                                { odd: oddX2, type: "X2" },
                                { odd: odd12, type: "12" },
                              ].map((item) => {
                                const isSelected = isOddSelected(match.id, item.type)
                                const oddsArray = [odd1, oddX, odd2, odd1X, oddX2, odd12]
                                  .map((o) => Number.parseFloat(o.replace("-", "0"))) // Handle "-" by treating as 0 for comparison
                                  .filter((o) => !isNaN(o)) // Filter out NaN values if parsing fails

                                const bestOdd = oddsArray.length > 0 ? Math.max(...oddsArray) : 0
                                const isBestOdd =
                                  Number.parseFloat(item.odd.replace("-", "0")) === bestOdd && item.odd !== "-"

                                return (
                                  <Button
                                    key={item.type}
                                    size="sm"
                                    className={`h-7 min-w-[46px] px-2 text-[11px] font-medium transition-all ${
                                      isSelected
                                        ? "bg-[#d946ef] border-[#d946ef] text-white hover:bg-[#c026d3]"
                                        : isBestOdd
                                          ? "bg-[#d946ef]/20 border border-[#d946ef] text-[#d946ef] hover:bg-[#d946ef]/40"
                                          : "bg-transparent border border-gray-600 text-white hover:bg-[#1a2942]"
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleOddToBetSlip(
                                        match.id,
                                        match.info_static?.competitor_home?.name?.en || "Home",
                                        match.info_static?.competitor_away?.name?.en || "Away",
                                        item.odd,
                                        item.type,
                                      )
                                    }}
                                    disabled={item.odd === "-"} // Disable if odd is "-"
                                  >
                                    {item.odd === "-" ? "—" : item.odd}
                                  </Button>
                                )
                              })}
                            </div>
                          </div>
                        </Card>
                      )
                    })
                  ) : (
                    <Card className="bg-[#0f1c33] border-[#1a2942] p-4 text-center">
                      <div className="text-sm text-gray-400">No live matches available</div>
                    </Card>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-[#0f1c33] px-3 py-2 rounded text-xs font-semibold">
                    <span className="text-red-500">🔴</span>
                    <span>⚽ Soccer</span>
                    <span className="text-gray-400">{selectedLeague.replace("-", " ").toUpperCase()}</span>
                    <div className="ml-auto flex gap-6 text-[10px] text-gray-400">
                      <span>1</span>
                      <span>X</span>
                      <span>2</span>
                      <span>1x</span>
                      <span>X2</span>
                      <span>12</span>
                    </div>
                  </div>

                  {isLoading ? (
                    <Card className="bg-[#0f1c33] border-[#1a2942] p-4 text-center">
                      <div className="text-sm text-gray-400">Loading matches...</div>
                    </Card>
                  ) : matches.length > 0 ? (
                    matches.slice(0, 10).map((match) => {
                      const allOdds = getMatchAllOdds(match)
                      const timeInfo = formatMatchTime(match.info_static.start_time)

                      const oddsList = [
                        { odd: allOdds.home, type: "1", name: "Home" },
                        { odd: allOdds.draw, type: "X", name: "Draw" },
                        { odd: allOdds.away, type: "2", name: "Away" },
                        { odd: allOdds.homeOrDraw, type: "1X", name: "Home/Draw" },
                        { odd: allOdds.drawOrAway, type: "X2", name: "Draw/Away" },
                        { odd: allOdds.homeOrAway, type: "12", name: "Home/Away" },
                      ]

                      return (
                        <Card
                          key={match.id}
                          className="bg-[#0f1c33] border-[#1a2942] p-2 cursor-pointer hover:bg-[#1a2942] transition-colors"
                          onClick={() => setSelectedMatchId(match.id)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-24 flex-shrink-0">
                              <div className="text-[9px] text-gray-400">
                                {timeInfo.date}
                                <br />
                                {timeInfo.time}
                              </div>
                            </div>

                            <div className="w-40 flex-shrink-0 flex items-center gap-2">
                              <div className="flex flex-col gap-1">
                                <img
                                  src={match.info_static.competitor_home.logo_url || "/placeholder.svg"}
                                  alt=""
                                  className="w-4 h-4 object-contain"
                                />
                                <img
                                  src={match.info_static.competitor_away.logo_url || "/placeholder.svg"}
                                  alt=""
                                  className="w-4 h-4 object-contain"
                                />
                              </div>
                              <div className="text-[11px] font-medium leading-tight flex-1">
                                {match.info_static.competitor_home.name.en}
                                <br />
                                {match.info_static.competitor_away.name.en}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button className="p-1 hover:bg-[#1a2942] rounded" onClick={(e) => e.stopPropagation()}>
                                <Star className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                              <button className="p-1 hover:bg-[#1a2942] rounded" onClick={(e) => e.stopPropagation()}>
                                <Info className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                              <button
                                className="px-1.5 py-0.5 hover:bg-[#1a2942] rounded text-gray-400 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                +
                              </button>
                              <button className="p-1 hover:bg-[#1a2942] rounded" onClick={(e) => e.stopPropagation()}>
                                <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                              </button>
                            </div>

                            <div className="flex gap-1.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                              {oddsList.map((oddData) => {
                                const isSelected = isOddSelected(match.id, oddData.type)
                                const oddsArray = [
                                  allOdds.home,
                                  allOdds.draw,
                                  allOdds.away,
                                  allOdds.homeOrDraw,
                                  allOdds.drawOrAway,
                                  allOdds.homeOrAway,
                                ]
                                  .map((o) => Number.parseFloat(o.replace("-", "0")))
                                  .filter((o) => !isNaN(o))

                                const bestOdd = oddsArray.length > 0 ? Math.max(...oddsArray) : 0
                                const currentOddFloat = Number.parseFloat(oddData.odd.replace("-", "0"))
                                const isBestOdd = currentOddFloat === bestOdd && oddData.odd !== "-"

                                return (
                                  <Button
                                    key={oddData.type}
                                    size="sm"
                                    className={`h-7 min-w-[46px] px-2 text-[11px] font-medium transition-all
                                    ${
                                      isSelected
                                        ? "bg-[#d946ef] border-[#d946ef] text-white hover:bg-[#c026d3]"
                                        : isBestOdd
                                          ? "bg-[#d946ef]/20 border border-[#d946ef] text-[#d946ef] hover:bg-[#d946ef]/40"
                                          : "bg-transparent border border-gray-600 text-white hover:bg-[#1a2942]"
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleOddToBetSlip(
                                        match.id,
                                        match.info_static.competitor_home.name.en,
                                        match.info_static.competitor_away.name.en,
                                        oddData.odd,
                                        oddData.type,
                                      )
                                    }}
                                    disabled={oddData.odd === "-"} // Disable if odd is "-"
                                  >
                                    {oddData.odd === "-" ? "—" : oddData.odd}
                                  </Button>
                                )
                              })}
                            </div>
                          </div>
                        </Card>
                      )
                    })
                  ) : (
                    <Card className="bg-[#0f1c33] border-[#1a2942] p-4 text-center">
                      <div className="text-sm text-gray-400">No matches available</div>
                    </Card>
                  )}
                </>
              )}

              {/* Turkey Cup Section - only show when no league selected */}
              {selectedLeague === null && (
                <>
                  <div className="flex items-center gap-2 bg-[#0f1c33] px-3 py-2 rounded text-xs font-semibold mt-4">
                    <span className="text-red-500">🔴</span>
                    <span>⚽ Soccer</span>
                    <img src="https://flagcdn.com/16x12/tr.png" alt="Turkey" className="w-4 h-3" />
                    <span className="text-gray-400">Türkiye Kupasi</span>
                    <div className="ml-auto flex gap-6 text-[10px] text-gray-400">
                      <span>1</span>
                      <span>X</span>
                      <span>2</span>
                      <span>1x</span>
                      <span>X2</span>
                      <span>12</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Popular Leagues */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">⚽ Popular Leagues</h3>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { match: topLeagueMatches.premierLeague, league: "Premier League", flag: "gb-eng" },
                  { match: topLeagueMatches.laLiga, league: "LaLiga", flag: "es" },
                  { match: topLeagueMatches.serieA, league: "Serie A", flag: "it" },
                  { match: topLeagueMatches.bundesliga, league: "Bundesliga", flag: "de" },
                ].map((item, i) => {
                  const match = item.match
                  if (!match) {
                    return (
                      <Card key={i} className="bg-[#0f1c33] border-[#1a2942] p-2">
                        <div className="text-[9px] text-gray-400 mb-2 flex items-center gap-1">
                          <img src={`https://flagcdn.com/16x12/${item.flag}.png`} alt="" className="w-4 h-3" />
                          {item.league}
                        </div>
                        <div className="text-[10px] text-gray-500">Loading...</div>
                      </Card>
                    )
                  }

                  const odds = getMatchOdds(match)
                  const matchTime = new Date(
                    (match.info_static?.start_time || match.start_date || 0) * 1000,
                  ).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })

                  const oddsList = [
                    { odd: odds.home, type: "1", name: "Home" },
                    { odd: odds.draw, type: "X", name: "Draw" },
                    { odd: odds.away, type: "2", name: "Away" },
                  ]

                  return (
                    <Card
                      key={i}
                      className="bg-[#0f1c33] border-[#1a2942] p-2 cursor-pointer hover:bg-[#1a2942] transition-colors"
                      onClick={() => setSelectedMatchId(match.id)}
                    >
                      <div className="text-[9px] text-gray-400 mb-2 flex items-center gap-1">
                        <img src={`https://flagcdn.com/16x12/${item.flag}.png`} alt="" className="w-4 h-3" />
                        {item.league}
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={
                              match.info_static?.competitor_home?.logo_url ||
                              match.home_team?.logo ||
                              "/placeholder.svg?height=24&width=24" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg"
                            }
                            alt="Home team"
                            className="w-6 h-6 rounded-full object-cover"
                          />
                          <span className="text-[10px] truncate max-w-[40px]">
                            {match.info_static?.competitor_home?.name?.en.substring(0, 3).toUpperCase() ||
                              match.home_team?.abbr ||
                              "---"}
                          </span>
                        </div>
                        <div className="text-xs font-bold">{matchTime}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] truncate max-w-[40px]">
                            {match.info_static?.competitor_away?.name?.en.substring(0, 3).toUpperCase() ||
                              match.away_team?.abbr ||
                              "---"}
                          </span>
                          <img
                            src={
                              match.info_static?.competitor_away?.logo_url ||
                              match.away_team?.logo ||
                              "/placeholder.svg?height=24&width=24" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg" ||
                              "/placeholder.svg"
                            }
                            alt="Away team"
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {oddsList.map((oddData) => {
                          const isSelected = isOddSelected(match.id, oddData.type)
                          const oddsArray = [odds.home, odds.draw, odds.away]
                            .map((o) => Number.parseFloat(o.replace("-", "0")))
                            .filter((o) => !isNaN(o))
                          const bestOdd = oddsArray.length > 0 ? Math.max(...oddsArray) : 0
                          const currentOddFloat = Number.parseFloat(oddData.odd.replace("-", "0"))
                          const isBestOdd = currentOddFloat === bestOdd && oddData.odd !== "-"

                          return (
                            <Button
                              key={oddData.type}
                              size="sm"
                              variant="outline"
                              className={`flex-1 h-6 text-[9px] border-gray-600 bg-transparent hover:bg-[#d946ef]
                              ${isOddSelected(match.id, oddData.type) ? "bg-[#d946ef] !text-white hover:bg-[#c026d3]" : ""}
                              `}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleOddToBetSlip(
                                  match.id,
                                  match.info_static.competitor_home.name.en,
                                  match.info_static.competitor_away.name.en,
                                  oddData.odd,
                                  oddData.type,
                                )
                              }}
                              disabled={oddData.odd === "-"}
                            >
                              {oddData.odd === "-" ? "—" : oddData.odd}
                            </Button>
                          )
                        })}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Player Cards */}
            <div className="grid grid-cols-5 gap-2 mt-4">
              {topScorers.length > 0
                ? topScorers.map((player, i) => {
                    const gradients = [
                      "from-yellow-400 to-yellow-500",
                      "from-cyan-400 to-cyan-500",
                      "from-purple-500 to-pink-500",
                      "from-orange-400 to-orange-500",
                      "from-teal-400 to-green-500",
                    ]
                    return (
                      <Card
                        key={player.playerMetadata.id}
                        className={`bg-gradient-to-br ${gradients[i]} border-0 h-28 relative overflow-hidden cursor-pointer hover:scale-105 transition-transform group`}
                        title={`${player.playerMetadata.name} - ${player.stats.goals} goals`}
                      >
                        <div className="absolute inset-0 flex flex-col justify-between p-2 z-10">
                          <div className="text-[10px] font-bold text-black/70 line-clamp-1">
                            {player.playerMetadata.name}
                          </div>
                          <div className="text-xs font-black text-black">{player.stats.goals} ⚽</div>
                        </div>
                        <img
                          src={`https://resources.premierleague.com/premierleague/photos/players/110x140/p${player.playerMetadata.id}.png`}
                          alt={player.playerMetadata.name}
                          className="absolute bottom-0 right-0 h-full w-auto object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                          onError={(e) => {
                            // Fallback to 40x40 if 110x140 fails
                            const target = e.target as HTMLImageElement
                            if (!target.src.includes("40x40")) {
                              target.src = `https://resources.premierleague.com/premierleague/photos/players/40x40/p${player.playerMetadata.id}.png`
                            }
                          }}
                        />
                      </Card>
                    )
                  })
                : // Fallback while loading
                  [1, 2, 3, 4, 5].map((i) => {
                    const gradients = [
                      "from-yellow-400 to-yellow-500",
                      "from-cyan-400 to-cyan-500",
                      "from-purple-500 to-pink-500",
                      "from-orange-400 to-orange-500",
                      "from-teal-400 to-green-500",
                    ]
                    return (
                      <Card
                        key={i}
                        className={`bg-gradient-to-br ${gradients[i - 1]} border-0 h-28 relative overflow-hidden animate-pulse`}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-xs text-black/50">Loading...</div>
                        </div>
                      </Card>
                    )
                  })}
            </div>

            {/* More Matches */}
            <div className="space-y-2 mt-4"></div>

            {/* Bottom Banner */}
            <Card className="bg-gradient-to-r from-[#1a1a2e] to-[#d946ef] border-0 p-4 relative overflow-hidden mt-4">
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold mb-1">SPORT</div>
                  <h2 className="text-2xl font-black">BETTING</h2>
                </div>
                <div className="bg-[#d946ef] px-6 py-3 rounded">
                  <div className="text-lg font-bold mb-1">FREE BONUS</div>
                  <div className="text-xs">234A 234A KS2261 FS61 FD41</div>
                  <Button size="sm" className="mt-2 w-full bg-[#fbbf24] text-black hover:bg-[#f59e0b] text-xs">
                    COPY THE CODE
                  </Button>
                </div>
              </div>
              <img
                src="/two-soccer-players.jpg"
                alt="Soccer Players"
                className="absolute right-0 top-0 h-full w-auto object-cover opacity-80"
              />
            </Card>
          </div>
        </main>

        {/* Right Sidebar - Bet Slip */}
        <aside className="w-72 bg-[#0f1c33] border-l border-[#1a2942] overflow-y-auto h-[calc(100vh-60px)]">
          <div className="p-3">
            {/* Bet Slip Tabs */}
            <div className="flex gap-2 mb-3">
              <Button size="sm" className="flex-1 h-8 text-xs bg-[#d946ef] hover:bg-[#c026d3]">
                BET SLIP ({betSlip.filter((b) => b.checked).length})
              </Button>
              <Button size="sm" variant="ghost" className="px-3 h-8 text-xs">
                SINGLE
              </Button>
              <Button size="sm" variant="ghost" className="px-3 h-8 text-xs">
                MULTI
              </Button>
              <Button size="sm" variant="ghost" className="px-3 h-8 text-xs">
                SYSTEM
              </Button>
            </div>

            {/* Selections */}
            <div className="mb-3">
              <div className="text-xs font-semibold mb-2">SELECTIONS ({betSlip.filter((b) => b.checked).length})</div>
              {betSlip.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-400">No selections yet</p>
                </div>
              ) : (
                betSlip.map((item) => (
                  <Card key={`${item.matchId}-${item.oddType}`} className="bg-[#0a1628] border-[#1a2942] p-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={(checked) => {
                          setBetSlip(
                            betSlip.map((bet) =>
                              bet.matchId === item.matchId && bet.oddType === item.oddType
                                ? { ...bet, checked: checked as boolean }
                                : bet,
                            ),
                          )
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-gray-400 mb-1">Match ({item.oddType})</div>
                        <div className="text-[11px] font-medium mb-1 truncate">{item.matchName}</div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-400">Live</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-bold">{item.odd}</div>
                        <button
                          onClick={() =>
                            setBetSlip(
                              betSlip.filter((bet) => !(bet.matchId === item.matchId && bet.oddType === item.oddType)),
                            )
                          }
                          className="text-[10px] text-gray-400 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>

            {/* Stake Input */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs">Mainline (NT)</span>
                <span className="font-medium">{totalOdds}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="flex-1 bg-[#0a1628] border-[#1a2942] h-8 text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-1 mb-3">
                {["5000", "10000", "25000", "50000"].map((amount) => (
                  <Button
                    key={amount}
                    size="sm"
                    variant="outline"
                    className="flex-1 h-6 text-[10px] border-gray-600 bg-transparent"
                    onClick={() => setStake(amount)}
                  >
                    UGX {Number.parseInt(amount).toLocaleString()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Total Odds</span>
                <span className="font-medium">{totalOdds}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-[#1a2942]">
                <span className="text-sm font-semibold">STAKE</span>
                <span className="text-sm font-bold">
                  UGX{" "}
                  {Number.parseFloat(stake).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="flex justify-between items-center text-[#d946ef]">
                <span className="text-sm font-semibold">Potential Returns:</span>
                <span className="text-lg font-bold">
                  UGX{" "}
                  {(Number.parseFloat(stake) * Number.parseFloat(totalOdds)).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {/* Place Bet Button */}
            {currentUser && Number.parseFloat(stake) > currentUserBalance ? (
              <Button
                onClick={() => setShowWalletDashboard(true)}
                className="w-full h-10 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-sm font-bold"
              >
                DEPOSIT
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if (!currentUser) {
                    setAuthModalOpen(true)
                  } else if (betSlip.filter((b) => b.checked).length > 0) {
                    handlePlaceBet()
                  }
                }}
                disabled={betSlip.filter((b) => b.checked).length === 0}
                className="w-full h-10 bg-gradient-to-r from-[#d946ef] to-[#c026d3] hover:from-[#c026d3] hover:to-[#a21caf] text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentUser ? "PLACE BET" : "LOGIN TO BET"}
              </Button>
            )}
          </div>
        </aside>
      </div>

      {selectedMatchId && <MatchDetailsModal matchId={selectedMatchId} onClose={() => setSelectedMatchId(null)} />}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialTab={authModalTab} />

      {showWalletDashboard && <WalletDashboard onClose={() => setShowWalletDashboard(false)} />}
    </div>
  )
}
