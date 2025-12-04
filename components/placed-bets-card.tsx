"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/firebase"
import { Card } from "@/components/ui/card"
import { updateDoc, doc } from "firebase/firestore"
import { Loader2 } from "lucide-react"
import { validateBet, validateOverallBetStatus } from "@/lib/bet-validator"

interface Match {
  matchId: number
  homeTeam: string
  awayTeam: string
  oddType: string
  odd: string
}

interface PlacedBetCardProps {
  bet: {
    id: string
    betId: string
    status: "pending" | "won" | "lost"
    totalStake: number
    potentialReturns: number
    selections: number
    timestamp: any
    matches: Match[]
    userId?: string
  }
  onViewDetails?: () => void
}

interface MatchStatus {
  matchId: number
  status: "pending" | "won" | "lost"
  score?: { home: number; away: number }
  eventStatus?: number
}

export function PlacedBetCard({ bet, onViewDetails }: PlacedBetCardProps) {
  const [matchStatuses, setMatchStatuses] = useState<Map<number, MatchStatus>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [betStatus, setBetStatus] = useState<"pending" | "won" | "lost">(bet.status)

  useEffect(() => {
    const fetchMatchStatuses = async () => {
      try {
        setIsLoading(true)

        if (!bet.matches || !Array.isArray(bet.matches) || bet.matches.length === 0) {
          console.warn("[v0] Bet has no matches to check:", bet.id)
          setIsLoading(false)
          return
        }

        const statuses = new Map<number, MatchStatus>()
        const matchStatusResults: Array<"pending" | "won" | "lost"> = []

        console.log("[v0] Checking status for", bet.matches.length, "matches")

        for (const match of bet.matches) {
          try {
            const response = await fetch(`/api/match-details?matchId=${match.matchId}`)
            if (response.ok) {
              const matchData = await response.json()
              const eventStatus = matchData.info_dynamic?.event_status || 0

              const validationResult = validateBet(match.oddType, matchData)

              console.log("[v0] Match validation:", {
                matchId: match.matchId,
                homeTeam: match.homeTeam,
                awayTeam: match.awayTeam,
                oddType: match.oddType,
                status: validationResult.status,
                reason: validationResult.reason,
              })

              statuses.set(match.matchId, {
                matchId: match.matchId,
                status: validationResult.status,
                score: matchData.info_dynamic?.score,
                eventStatus,
              })

              matchStatusResults.push(validationResult.status)
            } else {
              console.warn("[v0] Failed to fetch match details:", match.matchId)
              matchStatusResults.push("pending")
            }
          } catch (error) {
            console.error(`[v0] Error fetching details for match ${match.matchId}:`, error)
            matchStatusResults.push("pending")
          }
        }

        setMatchStatuses(statuses)

        const overallStatus = validateOverallBetStatus(matchStatusResults)

        if (overallStatus !== betStatus && bet.userId) {
          try {
            const betRef = doc(db, "users", bet.userId, "bets", bet.id)
            await updateDoc(betRef, {
              status: overallStatus,
              lastCheckedAt: new Date(),
              updatedAt: new Date(),
            })
            console.log("[v0] Bet status updated to:", overallStatus)
            setBetStatus(overallStatus)
          } catch (error) {
            console.error("[v0] Error updating bet status:", error)
          }
        }
      } finally {
        setIsLoading(false)
      }
    }

    if (bet.matches && bet.matches.length > 0) {
      fetchMatchStatuses()

      if (betStatus === "pending") {
        const interval = setInterval(fetchMatchStatuses, 60000)
        return () => clearInterval(interval)
      }
    } else {
      setIsLoading(false)
    }
  }, [bet, betStatus])

  const getStatusColor = (status: "pending" | "won" | "lost") => {
    switch (status) {
      case "won":
        return "bg-green-600"
      case "lost":
        return "bg-red-600"
      case "pending":
      default:
        return "bg-yellow-500"
    }
  }

  const getStatusLabel = (status: "pending" | "won" | "lost") => {
    switch (status) {
      case "won":
        return "Won"
      case "lost":
        return "Lost"
      case "pending":
      default:
        return "Pending"
    }
  }

  return (
    <Card className="bg-gray-900 border-gray-800 p-4 hover:border-purple-600 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-white font-medium">Bet #{bet.betId}</div>
            <div className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(betStatus)} text-white`}>
              {getStatusLabel(betStatus)}
            </div>
          </div>

          {(!bet.matches || bet.matches.length === 0) && (
            <div className="text-yellow-400 text-sm mb-3 bg-yellow-900/20 p-3 rounded border border-yellow-600">
              ⚠ No match data found. This bet may have been created with an older version.
            </div>
          )}

          <div className="space-y-2 mb-3">
            {bet.matches &&
              bet.matches.length > 0 &&
              bet.matches.map((match, idx) => {
                const matchStatus = matchStatuses.get(match.matchId)
                return (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-gray-800/50 p-2 rounded">
                    <div className="flex-1">
                      <p className="text-gray-300 font-medium">
                        {match.homeTeam} vs {match.awayTeam}
                      </p>
                      <p className="text-xs text-gray-500">
                        {match.oddType} @ {match.odd}
                      </p>
                    </div>
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    ) : matchStatus ? (
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`w-4 h-4 rounded-full ${getStatusColor(matchStatus.status)} flex items-center justify-center`}
                          title={getStatusLabel(matchStatus.status)}
                        >
                          <span className="text-white text-xs font-bold">
                            {matchStatus.status === "won" ? "✓" : matchStatus.status === "lost" ? "✗" : "•"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">{getStatusLabel(matchStatus.status)}</span>
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-gray-600" title="Status unknown" />
                    )}
                  </div>
                )
              })}
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs border-t border-gray-800 pt-3">
            <div>
              <p className="text-gray-500">Selections</p>
              <p className="text-white font-semibold">{bet.selections}</p>
            </div>
            <div>
              <p className="text-gray-500">Stake</p>
              <p className="text-white font-semibold">UGX {bet.totalStake.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-gray-500">Returns</p>
              <p className="text-cyan-400 font-semibold">UGX {bet.potentialReturns.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="ml-4 px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded font-medium transition-colors"
          >
            View
          </button>
        )}
      </div>
    </Card>
  )
}
