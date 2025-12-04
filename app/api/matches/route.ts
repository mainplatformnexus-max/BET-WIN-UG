import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const tournamentId = searchParams.get("tournament_id")

  if (!tournamentId) {
    return NextResponse.json({ error: "Tournament ID required" }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://betmaster.com/api/feed/sr/matches/sport/in-tournament?markets_set=main_extended&tournament_id=${tournamentId}&market=other`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
      },
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error fetching matches:", error)
    return NextResponse.json({ error: "Failed to fetch matches" }, { status: 500 })
  }
}
