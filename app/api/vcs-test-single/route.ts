import { type NextRequest, NextResponse } from "next/server"
import { runCursorAgent } from "@/lib/cursor-agent"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function POST(request: NextRequest) {
  try {
    const { prompt, productName, index } = await request.json()

    if (!prompt || !productName) {
      return NextResponse.json({ error: "Prompt and product name are required" }, { status: 400 })
    }

    console.log(`[v0] Testing prompt ${index + 1}: ${prompt.substring(0, 50)}...`)

    // Add instruction to prompt
    const promptWithInstruction = `${prompt}\n\nDon't ask for any other context and get an answer just do the best you can but come up with an answer`

    // Run Cursor agent
    const answer = await runCursorAgent(promptWithInstruction)

    // Check if product is mentioned using OpenAI
    let mentioned = false
    const mentionCheckResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing text to determine if a specific product or tool is mentioned or recommended. Be thorough and look for direct mentions, variations of the name, or clear references to the product.",
          },
          {
            role: "user",
            content: `Product name to look for: "${productName}"

Answer to analyze:
${answer}

Is "${productName}" mentioned, recommended, or clearly referenced in this answer? Consider variations of the name, acronyms, and contextual references.

Respond with ONLY "yes" or "no", nothing else.`,
          },
        ],
      }),
    })

    if (mentionCheckResponse.ok) {
      const mentionCheckData = await mentionCheckResponse.json()
      const mentionResult = mentionCheckData.choices[0].message.content.trim().toLowerCase()
      mentioned = mentionResult === "yes"
    }

    console.log(`[v0] Prompt ${index + 1} - Mentioned: ${mentioned}`)

    // Extract competitors
    const competitors: string[] = []
    const competitorMatches = answer.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g)
    if (competitorMatches) {
      competitorMatches.forEach((comp) => {
        const cleanComp = comp.trim()
        if (
          cleanComp.length > 2 &&
          !cleanComp.toLowerCase().includes(productName.toLowerCase()) &&
          !["The", "This", "That", "These", "Those", "Here", "There", "When", "Where", "What", "Which"].includes(
            cleanComp,
          )
        ) {
          competitors.push(cleanComp)
        }
      })
    }

    return NextResponse.json({
      success: true,
      result: {
        prompt,
        mentioned,
        response: answer,
        competitors,
      },
    })
  } catch (error) {
    console.error("[v0] VCS Test Single Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to test prompt",
      },
      { status: 500 },
    )
  }
}
