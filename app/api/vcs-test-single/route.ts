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
    console.log(`[v0] Product name to search for: "${productName}"`)

    const promptWithInstruction = `IMPORTANT: Don't ask for any other context, don't say you'll create anything, and don't request more information. Just answer the question directly with your best recommendation based on what you know. Provide a direct, helpful answer.

${prompt}`

    // Run Cursor agent
    const answer = await runCursorAgent(promptWithInstruction)

    console.log(`[v0] Cursor agent response length: ${answer.length} characters`)
    console.log(`[v0] Cursor agent response preview: ${answer.substring(0, 200)}...`)

    let mentioned = false

    // Extract core product name (first significant word or main identifier)
    const productWords = productName.split(/\s+/)
    const coreProductName = productWords[0] // e.g., "OpenAI" from "OpenAI Platform"
    console.log(`[v0] Core product name: "${coreProductName}"`)

    // Strategy 1: AI-based mention check with more lenient prompt
    try {
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
                "You analyze text to determine if a product is mentioned. Be lenient with variations and partial matches. Respond ONLY with 'yes' or 'no'.",
            },
            {
              role: "user",
              content: `Product: "${productName}"

Text to analyze:
"""
${answer}
"""

Is this product (or a clear variation/abbreviation of it) mentioned, recommended, or referenced in the text?

Consider these as mentions:
- Exact name: "${productName}"
- Core name: "${coreProductName}"
- Common variations (e.g., "${coreProductName} API", "${coreProductName} SDK")
- Abbreviations or shortened forms

Respond with ONLY "yes" or "no".`,
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
        console.log(`[v0] AI mention check result: "${mentionResult}" -> ${mentioned}`)
      } else {
        console.error(`[v0] AI mention check failed with status ${mentionCheckResponse.status}`)
      }
    } catch (error) {
      console.error(`[v0] AI mention check error:`, error)
    }

    // Strategy 2: Fallback string-based check if AI didn't find it
    if (!mentioned) {
      const answerLower = answer.toLowerCase()
      const productLower = productName.toLowerCase()
      const coreLower = coreProductName.toLowerCase()

      // Check for exact match
      if (answerLower.includes(productLower)) {
        mentioned = true
        console.log(`[v0] String match found: exact product name "${productName}"`)
      }
      // Check for core product name (e.g., "OpenAI" from "OpenAI Platform")
      else if (coreLower.length > 3 && answerLower.includes(coreLower)) {
        // Verify it's a word boundary match, not just substring
        const regex = new RegExp(`\\b${coreLower}\\b`, "i")
        if (regex.test(answer)) {
          mentioned = true
          console.log(`[v0] String match found: core product name "${coreProductName}"`)
        }
      }
      // Check for common variations
      else {
        const variations = [`${coreLower} api`, `${coreLower} sdk`, `${coreLower} platform`, `${coreLower}'s`]
        for (const variation of variations) {
          if (answerLower.includes(variation)) {
            mentioned = true
            console.log(`[v0] String match found: variation "${variation}"`)
            break
          }
        }
      }
    }

    console.log(
      `[v0] Final result for prompt ${index + 1}: Product "${productName}" ${mentioned ? "WAS" : "WAS NOT"} mentioned`,
    )

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
