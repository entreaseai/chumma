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
    console.log(`[v0] Looking for product: "${productName}"`)

    const promptWithInstruction = `IMPORTANT: Don't ask for any other context, don't say you'll create anything, and don't request more information. Just answer the question directly with your best recommendation based on what you know. Provide a direct, helpful answer.

${prompt}`

    // Run Cursor agent
    const answer = await runCursorAgent(promptWithInstruction)

    console.log(`[v0] Cursor agent response length: ${answer.length} characters`)
    console.log(`[v0] Cursor agent response preview: ${answer.substring(0, 200)}...`)

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
              "You are an expert at analyzing text to determine if a specific product or tool is mentioned or recommended. Be thorough but accurate. You respond with ONLY 'yes' or 'no'.",
          },
          {
            role: "user",
            content: `Product/Tool to look for: "${productName}"

Answer to analyze:
"""
${answer}
"""

Question: Is "${productName}" explicitly mentioned, recommended, suggested, or clearly referenced in this answer? 

Look for:
- Direct mentions of the exact product name
- Variations, abbreviations, or related terms (e.g., "Next" for "Next.js", "Supabase Auth" for "Supabase")
- Clear recommendations or suggestions to use this product
- References to this product as a solution

Important: Only respond "yes" if the product is actually mentioned or recommended. Don't respond "yes" just because the answer is related to the same category.

Respond with ONLY "yes" or "no" (lowercase, no punctuation, no explanation).`,
          },
        ],
        temperature: 0,
        max_tokens: 10,
      }),
    })

    if (mentionCheckResponse.ok) {
      const mentionCheckData = await mentionCheckResponse.json()
      const mentionResult = mentionCheckData.choices[0].message.content.trim().toLowerCase()
      mentioned = mentionResult.includes("yes")
      console.log(`[v0] Mention check result: "${mentionResult}" -> ${mentioned}`)
      console.log(`[v0] Product "${productName}" ${mentioned ? "WAS" : "WAS NOT"} mentioned in the response`)
    } else {
      console.error(`[v0] Mention check API failed with status ${mentionCheckResponse.status}`)
      const errorText = await mentionCheckResponse.text()
      console.error(`[v0] Mention check error: ${errorText}`)
    }

    console.log(`[v0] Prompt ${index + 1} - Final result: Mentioned = ${mentioned}`)

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
