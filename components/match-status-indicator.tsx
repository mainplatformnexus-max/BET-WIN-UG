"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { updateDoc, doc, getDoc } from "firebase/firestore"
import { validateBet, validateOverallBetStatus } from "@/lib/bet-validator"

interface MatchStatusIndicatorProps {
  matchId: string | number
  oddType: string
  homeTeamGoals?: number
  awayTeamGoals?: number
  betId?: string
  userId?: string
}

export function MatchStatusIndicator({
  matchId,
  oddType,
  homeTeamGoals,
  awayTeamGoals,
  betId,
  userId,
}: MatchStatusIndicatorProps) {
  const [status, setStatus] = useState<"pending" | "won" | "lost">("pending")
  const [matchProcessed, setMatchProcessed] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0)

  useEffect(() => {
    const fetchMatchStatus = async () => {
      const now = Date.now()
      if (now - lastUpdateTime < 2000) {
        return
      }
      setLastUpdateTime(now)

      try {
        const response = await fetch(`/api/match-details?matchId=${matchId}`)
        if (!response.ok) {
          console.log("[v0] Match API response not ok:", response.status)
          return
        }

        const matchData = await response.json()
        console.log("[v0] Match data received for validation:", {
          matchId,
          score: matchData.info_dynamic?.score,
          eventStatus: matchData.info_dynamic?.event_status,
          oddType,
        })

        const validationResult = validateBet(oddType, matchData, homeTeamGoals, awayTeamGoals)

        console.log("[v0] Validation result:", {
          matchId,
          oddType,
          status: validationResult.status,
          canBeDecided: validationResult.canBeDecided,
          reason: validationResult.reason,
        })

        // Update local status
        setStatus(validationResult.status)

        if (
          validationResult.canBeDecided &&
          validationResult.status !== "pending" &&
          !matchProcessed &&
          betId &&
          userId
        ) {
          try {
            const betRef = doc(db, "users", userId, "bets", betId)
            const betDoc = await getDoc(betRef)

            if (betDoc.exists()) {
              const betData = betDoc.data()
              const matches = betData.matches || []

              const updatedMatches = matches.map((match: any) => {
                if (match.matchId === matchId || match.matchId === String(matchId)) {
                  return {
                    ...match,
                    matchStatus: validationResult.status,
                    statusReason: validationResult.reason,
                    statusUpdatedAt: new Date(),
                  }
                }
                return match
              })

              const matchStatuses = updatedMatches.map((m: any) => m.matchStatus || "pending")
              const overallStatus = validateOverallBetStatus(matchStatuses)

              await updateDoc(betRef, {
                matches: updatedMatches,
                status: overallStatus,
                lastCheckedAt: new Date(),
                updatedAt: new Date(),
              })

              console.log("[v0] Bet updated in Firebase:", {
                matchId,
                matchStatus: validationResult.status,
                overallBetStatus: overallStatus,
                reason: validationResult.reason,
              })

              setMatchProcessed(true)

              if (overallStatus === "lost") {
                return
              }
            }
          } catch (error) {
            console.error("[v0] Error updating bet in Firebase:", error)
          }
        }
      } catch (error) {
        console.error("[v0] Error fetching match status:", error)
      }
    }

    if (matchProcessed) {
      return
    }

    fetchMatchStatus()
    const interval = setInterval(fetchMatchStatus, 5000) // Poll every 5 seconds
    return () => clearInterval(interval)
  }, [matchId, oddType, betId, userId, matchProcessed, homeTeamGoals, awayTeamGoals, lastUpdateTime])

  const getStatusColor = () => {
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

  const getStatusIcon = () => {
    switch (status) {
      case "won":
        return "✓"
      case "lost":
        return "✗"
      case "pending":
      default:
        return "⏳"
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`w-6 h-6 rounded-full ${getStatusColor()} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
      >
        {getStatusIcon()}
      </div>
      <span className="text-xs text-gray-400 capitalize font-medium">{status}</span>
    </div>
  )
}
