import { type NextRequest, NextResponse } from "next/server"
import { createCursorAgent } from "@/lib/cursor-agent"

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    const result = await createCursorAgent(prompt)

    return NextResponse.json({
      success: true,
      agentId: result.agentId,
      status: result.status,
    })
  } catch (error) {
    console.error("[v0] Cursor Agent Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create agent",
      },
      { status: 500 },
    )
  }
}
