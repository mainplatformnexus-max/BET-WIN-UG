"use client"

import { useEffect, useState } from "react"
import { X } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface MatchDetailsModalProps {
  matchId: number
  onClose: () => void
  onAddToTicket?: (matchId: number, homeTeam: string, awayTeam: string, odd: string, oddType: string) => void
}

interface MatchDetails {
  id: number
  info_static: {
    competitor_home: {
      name: { en: string }
      logo_url: string
    }
    competitor_away: {
      name: { en: string }
      logo_url: string
    }
    tournament: {
      name: { en: string }
      logo_url: string
    }
    start_time: number
  }
  info_dynamic: {
    competition_status: {
      name: { en: string }
    }
    score?: {
      home: number
      away: number
    }
  }
  odds: any
}

export function MatchDetailsModal({ matchId, onClose, onAddToTicket }: MatchDetailsModalProps) {
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMatchDetails = async () => {
      try {
        setIsLoading(true)
        setError(null)
        console.log("[v0] Fetching match details for ID:", matchId)
        const response = await fetch(`/api/match-details?matchId=${matchId}`)

        if (!response.ok) {
          throw new Error("Failed to fetch match details")
        }

        const data = await response.json()
        console.log("[v0] Match details received:", data)
        setMatchDetails(data)
      } catch (err) {
        setError("Failed to load match details")
        console.error("[v0] Error fetching match details:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMatchDetails()
  }, [matchId])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = "unset"
    }
  }, [])

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getMainOdds = () => {
    if (!matchDetails?.odds?.sr1?.["3"]?.["1"]?.sp?._?.out) return null
    const odds = matchDetails.odds.sr1["3"]["1"].sp._.out
    return {
      home: odds["1"]?.o || "-",
      draw: odds["2"]?.o || "-",
      away: odds["3"]?.o || "-",
    }
  }

  const getDoubleChanceOdds = () => {
    if (!matchDetails?.odds?.sr1?.["3"]?.["10"]?.sp?._?.out) return null
    const odds = matchDetails.odds.sr1["3"]["10"].sp._.out
    return {
      "1x": odds["9"]?.o || "-",
      x2: odds["10"]?.o || "-",
      "12": odds["11"]?.o || "-",
    }
  }

  const getAllMarkets = () => {
    if (!matchDetails?.odds?.sr1?.["3"]) return []

    const markets = matchDetails.odds.sr1["3"]
    const marketList = []

    const marketNames: Record<string, string> = {
      "1": "Match Winner (1X2)",
      "10": "Double Chance",
      "18": "Total Goals",
      "16": "Asian Handicap",
      "11": "Both Teams to Score",
      "14": "Handicap",
      "8": "First Goal",
      "9": "Next Goal",
      "12": "Home Team Total",
      "13": "Away Team Total",
    }

    for (const [marketId, marketData] of Object.entries(markets)) {
      if (typeof marketData === "object" && marketData !== null && marketData.id) {
        marketList.push({
          id: marketId,
          name: marketNames[marketId] || `Market ${marketId}`,
          data: marketData,
        })
      }
    }

    return marketList
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-2">
      <Card className="bg-[#0a1628] border-[#1a2942] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[#1a2942] flex-shrink-0">
          <h2 className="text-base font-bold text-white">Match Details</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-400 hover:text-white h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-[#1a2942] scrollbar-track-transparent">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400 text-sm">Loading match details...</div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          ) : matchDetails ? (
            <div className="space-y-3">
              {/* Match Header */}
              <Card className="bg-[#0f1f38] border-[#1a2942] p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <img
                      src={matchDetails.info_static.tournament.logo_url || "/placeholder.svg"}
                      alt="Tournament"
                      className="w-4 h-4"
                    />
                    <span className="text-[10px] text-gray-400">{matchDetails.info_static.tournament.name.en}</span>
                  </div>
                  <div className="text-[10px] text-gray-400">{formatTime(matchDetails.info_static.start_time)}</div>
                </div>

                {/* Teams */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <img
                      src={matchDetails.info_static.competitor_home.logo_url || "/placeholder.svg"}
                      alt={matchDetails.info_static.competitor_home.name.en}
                      className="w-8 h-8"
                    />
                    <span className="text-white font-medium text-sm">
                      {matchDetails.info_static.competitor_home.name.en}
                    </span>
                  </div>

                  <div className="text-lg font-bold text-white px-3">
                    {matchDetails.info_dynamic.score
                      ? `${matchDetails.info_dynamic.score.home} - ${matchDetails.info_dynamic.score.away}`
                      : "VS"}
                  </div>

                  <div className="flex items-center gap-2 flex-1 justify-end">
                    <span className="text-white font-medium text-sm">
                      {matchDetails.info_static.competitor_away.name.en}
                    </span>
                    <img
                      src={matchDetails.info_static.competitor_away.logo_url || "/placeholder.svg"}
                      alt={matchDetails.info_static.competitor_away.name.en}
                      className="w-8 h-8"
                    />
                  </div>
                </div>

                <div className="text-center mt-2">
                  <span className="text-[10px] bg-[#1a2942] px-2 py-1 rounded text-gray-300">
                    {matchDetails.info_dynamic.competition_status.name.en}
                  </span>
                </div>
              </Card>

              {/* Main Betting Section */}
              <Card className="bg-[#0f1f38] border-[#1a2942] p-3">
                <h3 className="text-xs font-semibold text-white mb-2">Main Markets</h3>

                {/* 1X2 Odds */}
                {getMainOdds() && (
                  <div className="mb-3">
                    <div className="text-[10px] text-gray-400 mb-1.5">Match Winner</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button
                        className="bg-[#1a2942] hover:bg-[#c026d3] text-white h-10 flex flex-col text-xs"
                        onClick={() =>
                          onAddToTicket?.(
                            matchId,
                            matchDetails.info_static.competitor_home.name.en,
                            matchDetails.info_static.competitor_away.name.en,
                            getMainOdds()?.home || "",
                            "1",
                          )
                        }
                      >
                        <span className="text-[9px] text-gray-400 mb-0.5">1 (Home)</span>
                        <span className="text-sm font-bold">{getMainOdds()?.home}</span>
                      </Button>
                      <Button
                        className="bg-[#1a2942] hover:bg-[#c026d3] text-white h-10 flex flex-col text-xs"
                        onClick={() =>
                          onAddToTicket?.(
                            matchId,
                            matchDetails.info_static.competitor_home.name.en,
                            matchDetails.info_static.competitor_away.name.en,
                            getMainOdds()?.draw || "",
                            "X",
                          )
                        }
                      >
                        <span className="text-[9px] text-gray-400 mb-0.5">X (Draw)</span>
                        <span className="text-sm font-bold">{getMainOdds()?.draw}</span>
                      </Button>
                      <Button
                        className="bg-[#1a2942] hover:bg-[#c026d3] text-white h-10 flex flex-col text-xs"
                        onClick={() =>
                          onAddToTicket?.(
                            matchId,
                            matchDetails.info_static.competitor_home.name.en,
                            matchDetails.info_static.competitor_away.name.en,
                            getMainOdds()?.away || "",
                            "2",
                          )
                        }
                      >
                        <span className="text-[9px] text-gray-400 mb-0.5">2 (Away)</span>
                        <span className="text-sm font-bold">{getMainOdds()?.away}</span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* Double Chance Odds */}
                {getDoubleChanceOdds() && (
                  <div>
                    <div className="text-[10px] text-gray-400 mb-1.5">Double Chance</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <Button
                        className="bg-[#1a2942] hover:bg-[#c026d3] text-white h-10 flex flex-col text-xs"
                        onClick={() =>
                          onAddToTicket?.(
                            matchId,
                            matchDetails.info_static.competitor_home.name.en,
                            matchDetails.info_static.competitor_away.name.en,
                            getDoubleChanceOdds()?.["1x"] || "",
                            "1X",
                          )
                        }
                      >
                        <span className="text-[9px] text-gray-400 mb-0.5">1X</span>
                        <span className="text-sm font-bold">{getDoubleChanceOdds()?.["1x"]}</span>
                      </Button>
                      <Button
                        className="bg-[#1a2942] hover:bg-[#c026d3] text-white h-10 flex flex-col text-xs"
                        onClick={() =>
                          onAddToTicket?.(
                            matchId,
                            matchDetails.info_static.competitor_home.name.en,
                            matchDetails.info_static.competitor_away.name.en,
                            getDoubleChanceOdds()?.x2 || "",
                            "X2",
                          )
                        }
                      >
                        <span className="text-[9px] text-gray-400 mb-0.5">X2</span>
                        <span className="text-sm font-bold">{getDoubleChanceOdds()?.x2}</span>
                      </Button>
                      <Button
                        className="bg-[#1a2942] hover:bg-[#c026d3] text-white h-10 flex flex-col text-xs"
                        onClick={() =>
                          onAddToTicket?.(
                            matchId,
                            matchDetails.info_static.competitor_home.name.en,
                            matchDetails.info_static.competitor_away.name.en,
                            getDoubleChanceOdds()?.["12"] || "",
                            "12",
                          )
                        }
                      >
                        <span className="text-[9px] text-gray-400 mb-0.5">12</span>
                        <span className="text-sm font-bold">{getDoubleChanceOdds()?.["12"]}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* All Markets */}
              <Card className="bg-[#0f1f38] border-[#1a2942] p-3">
                <h3 className="text-xs font-semibold text-white mb-2">
                  All Available Markets ({getAllMarkets().length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {getAllMarkets().map((market) => (
                    <div key={market.id} className="bg-[#0a1628] p-2 rounded-lg border border-[#1a2942]">
                      <div className="text-[10px] font-semibold text-gray-300 mb-1.5">{market.name}</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(market.data.sp || {}).map(([specifier, specData]: [string, any]) => {
                          if (specData?.out) {
                            return Object.entries(specData.out)
                              .slice(0, 6)
                              .map(([outcomeId, outcome]: [string, any]) => (
                                <Button
                                  key={`${market.id}-${specifier}-${outcomeId}`}
                                  className="bg-[#1a2942] hover:bg-[#c026d3] text-white h-8 text-[10px] flex items-center justify-center"
                                  onClick={() =>
                                    onAddToTicket?.(
                                      matchId,
                                      matchDetails.info_static.competitor_home.name.en,
                                      matchDetails.info_static.competitor_away.name.en,
                                      outcome.o || "",
                                      market.name,
                                    )
                                  }
                                >
                                  <span className="font-bold">{outcome.o}</span>
                                </Button>
                              ))
                          }
                          return null
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
