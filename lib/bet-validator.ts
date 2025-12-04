interface MatchData {
  info_dynamic?: {
    event_status?: number
    competition_status?: {
      id: number
      name: { en: string }
    }
    score?: {
      h: number
      a: number
    }
  }
}

interface BetValidationResult {
  status: "pending" | "won" | "lost"
  canBeDecided: boolean
  reason?: string
}

/**
 * Determines if a bet can be decided during the match or only after it ends
 */
export function canMarketBeDecidedDuringMatch(marketType: string): boolean {
  // Markets that can be decided during the match
  const earlyDecisionMarkets = [
    "over",
    "under", // Over/Under goals
    "btts",
    "gg",
    "both teams to score", // Both Teams to Score
    "first goal",
    "next goal", // Goal markets
    "total corners",
    "corners", // Corner markets
    "cards",
    "bookings", // Card markets
  ]

  const marketLower = marketType.toLowerCase()
  return earlyDecisionMarkets.some((market) => marketLower.includes(market))
}

/**
 * Checks if the match has ended
 */
export function isMatchEnded(matchData: MatchData): boolean {
  // event_status: 0 = not started, 1 = live, 2 = ended, 3 = closed
  const eventStatus = matchData.info_dynamic?.event_status

  if (eventStatus === 2 || eventStatus === 3) {
    return true
  }

  // Also check competition_status for "ended" or "finished"
  const compStatus = matchData.info_dynamic?.competition_status?.name?.en?.toLowerCase()
  if (
    compStatus &&
    (compStatus.includes("ended") ||
      compStatus.includes("finished") ||
      compStatus.includes("fulltime") ||
      compStatus.includes("full-time"))
  ) {
    return true
  }

  return false
}

/**
 * Validates a 1X2 bet (Home Win, Draw, Away Win)
 */
function validate1X2Bet(
  oddType: string,
  homeGoals: number,
  awayGoals: number,
  matchEnded: boolean,
): BetValidationResult {
  // Only decide after match ends
  if (!matchEnded) {
    return { status: "pending", canBeDecided: false }
  }

  if (oddType === "1" || oddType === "1X2-1" || oddType.toLowerCase().includes("home")) {
    // Home Win
    const won = homeGoals > awayGoals
    return { status: won ? "won" : "lost", canBeDecided: true, reason: `Final score: ${homeGoals}-${awayGoals}` }
  } else if (oddType === "X" || oddType === "1X2-X" || oddType.toLowerCase() === "draw") {
    // Draw
    const won = homeGoals === awayGoals
    return { status: won ? "won" : "lost", canBeDecided: true, reason: `Final score: ${homeGoals}-${awayGoals}` }
  } else if (oddType === "2" || oddType === "1X2-2" || oddType.toLowerCase().includes("away")) {
    // Away Win
    const won = awayGoals > homeGoals
    return { status: won ? "won" : "lost", canBeDecided: true, reason: `Final score: ${homeGoals}-${awayGoals}` }
  }

  return { status: "pending", canBeDecided: false }
}

/**
 * Validates a Double Chance bet (1X, X2, 12)
 */
function validateDoubleChanceBet(
  oddType: string,
  homeGoals: number,
  awayGoals: number,
  matchEnded: boolean,
): BetValidationResult {
  // Only decide after match ends
  if (!matchEnded) {
    return { status: "pending", canBeDecided: false }
  }

  const typeLower = oddType.toLowerCase()

  if (typeLower.includes("1x") || typeLower === "1x") {
    // Home Win or Draw
    const won = homeGoals >= awayGoals
    return { status: won ? "won" : "lost", canBeDecided: true, reason: `Final score: ${homeGoals}-${awayGoals}` }
  } else if (typeLower.includes("x2") || typeLower === "x2" || typeLower === "2x") {
    // Draw or Away Win
    const won = awayGoals >= homeGoals
    return { status: won ? "won" : "lost", canBeDecided: true, reason: `Final score: ${homeGoals}-${awayGoals}` }
  } else if (typeLower.includes("12") || typeLower === "12") {
    // Home Win or Away Win (No Draw)
    const won = homeGoals !== awayGoals
    return { status: won ? "won" : "lost", canBeDecided: true, reason: `Final score: ${homeGoals}-${awayGoals}` }
  }

  return { status: "pending", canBeDecided: false }
}

/**
 * Validates Over/Under bets
 */
function validateOverUnderBet(
  oddType: string,
  homeGoals: number,
  awayGoals: number,
  matchEnded: boolean,
): BetValidationResult {
  const totalGoals = homeGoals + awayGoals
  const typeLower = oddType.toLowerCase()

  // Extract the line (e.g., "2.5" from "Over 2.5")
  const lineMatch = typeLower.match(/(\d+\.?\d*)/)
  if (!lineMatch) {
    return { status: "pending", canBeDecided: false }
  }

  const line = Number.parseFloat(lineMatch[1])

  if (typeLower.includes("over")) {
    // For Over bets, can be decided early if threshold is reached
    if (totalGoals > line) {
      return { status: "won", canBeDecided: true, reason: `Total goals: ${totalGoals} > ${line}` }
    }
    // If match ended and threshold not reached, it's lost
    if (matchEnded && totalGoals <= line) {
      return { status: "lost", canBeDecided: true, reason: `Final total: ${totalGoals} ≤ ${line}` }
    }
  } else if (typeLower.includes("under")) {
    // For Under bets, can only be decided after match ends
    if (matchEnded) {
      const won = totalGoals < line
      return {
        status: won ? "won" : "lost",
        canBeDecided: true,
        reason: `Final total: ${totalGoals} ${won ? "<" : "≥"} ${line}`,
      }
    }
    // But if already exceeded during match, it's lost
    if (totalGoals > line) {
      return { status: "lost", canBeDecided: true, reason: `Total goals: ${totalGoals} > ${line}` }
    }
  }

  return { status: "pending", canBeDecided: false }
}

/**
 * Validates Both Teams to Score (BTTS/GG) bets
 */
function validateBTTSBet(
  oddType: string,
  homeGoals: number,
  awayGoals: number,
  matchEnded: boolean,
): BetValidationResult {
  const typeLower = oddType.toLowerCase()
  const bothScored = homeGoals > 0 && awayGoals > 0

  if (typeLower.includes("yes") || typeLower.includes("gg") || typeLower === "btts") {
    // Both Teams to Score - YES
    if (bothScored) {
      return { status: "won", canBeDecided: true, reason: "Both teams scored" }
    }
    if (matchEnded) {
      return { status: "lost", canBeDecided: true, reason: "At least one team didn't score" }
    }
  } else if (typeLower.includes("no") || typeLower.includes("ng")) {
    // Both Teams to Score - NO
    // Can only be decided after match ends
    if (matchEnded) {
      const won = !bothScored
      return {
        status: won ? "won" : "lost",
        canBeDecided: true,
        reason: won ? "At least one team didn't score" : "Both teams scored",
      }
    }
    // But if both scored during match, it's lost
    if (bothScored) {
      return { status: "lost", canBeDecided: true, reason: "Both teams scored" }
    }
  }

  return { status: "pending", canBeDecided: false }
}

/**
 * Main validation function that routes to appropriate validator
 */
export function validateBet(
  oddType: string,
  matchData: MatchData,
  homeTeamGoals?: number,
  awayTeamGoals?: number,
): BetValidationResult {
  const homeGoals = matchData.info_dynamic?.score?.h ?? homeTeamGoals ?? 0
  const awayGoals = matchData.info_dynamic?.score?.a ?? awayTeamGoals ?? 0
  const matchEnded = isMatchEnded(matchData)

  const typeLower = oddType.toLowerCase()

  // Route to appropriate validator based on market type
  if (typeLower.includes("over") || typeLower.includes("under")) {
    return validateOverUnderBet(oddType, homeGoals, awayGoals, matchEnded)
  }

  if (
    typeLower.includes("btts") ||
    typeLower.includes("gg") ||
    typeLower.includes("ng") ||
    typeLower.includes("both teams to score")
  ) {
    return validateBTTSBet(oddType, homeGoals, awayGoals, matchEnded)
  }

  if (
    typeLower.includes("1x") ||
    typeLower.includes("x2") ||
    typeLower.includes("12") ||
    typeLower.includes("double chance")
  ) {
    return validateDoubleChanceBet(oddType, homeGoals, awayGoals, matchEnded)
  }

  // Default to 1X2 validation
  if (
    typeLower.includes("1x2") ||
    typeLower === "1" ||
    typeLower === "x" ||
    typeLower === "2" ||
    typeLower.includes("home") ||
    typeLower.includes("draw") ||
    typeLower.includes("away")
  ) {
    return validate1X2Bet(oddType, homeGoals, awayGoals, matchEnded)
  }

  // For unknown market types, only decide after match ends
  if (matchEnded) {
    console.warn(`[v0] Unknown market type for validation: ${oddType}`)
  }

  return { status: "pending", canBeDecided: false }
}

/**
 * Validates overall bet status based on all matches
 */
export function validateOverallBetStatus(matchStatuses: Array<"pending" | "won" | "lost">): "pending" | "won" | "lost" {
  // If ANY match is lost, the entire bet is lost
  if (matchStatuses.includes("lost")) {
    return "lost"
  }

  // If ALL matches are won, the bet is won
  if (matchStatuses.every((status) => status === "won")) {
    return "won"
  }

  // Otherwise, the bet is still pending
  return "pending"
}
