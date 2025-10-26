import { type NextRequest, NextResponse } from "next/server"
import { runCursorAgent } from "@/lib/cursor-agent"

interface PromptTestResult {
  prompt: string
  mentioned: boolean
  response: string
}

interface VCSTestResult {
  score: number
  totalTests: number
  prompts: string[]
  promptResults: PromptTestResult[]
  competitors: string[]
  productMentioned: boolean
}

export async function POST(request: NextRequest) {
  try {
    const { prompts, productName } = await request.json()

    if (!prompts || !Array.isArray(prompts)) {
      return NextResponse.json({ error: "Prompts array is required" }, { status: 400 })
    }

    if (!productName) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 })
    }

    let recommendationCount = 0
    const competitorsSet = new Set<string>()
    let productMentioned = false
    const promptResults: PromptTestResult[] = []
    const productNameLower = productName.toLowerCase()

    for (let i = 0; i < prompts.length; i++) {
      try {
        console.log(`[v0] Testing prompt ${i + 1}/${prompts.length}:`, prompts[i])

        const cursorAnswer = await runCursorAgent(prompts[i])
        const answerLower = cursorAnswer.toLowerCase()

        console.log(`[v0] Got answer for prompt ${i + 1}`)

        // Check if product was mentioned
        const wasMentioned = answerLower.includes(productNameLower)

        if (wasMentioned) {
          recommendationCount++
          productMentioned = true
          console.log(`[v0] Product mentioned in prompt ${i + 1}!`)
        }

        promptResults.push({
          prompt: prompts[i],
          mentioned: wasMentioned,
          response: cursorAnswer,
        })

        // Extract potential competitor tools (capitalized words)
        const toolMentions = cursorAnswer.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []
        toolMentions.forEach((tool) => {
          if (tool.length > 2 && !tool.match(/^(The|This|That|These|Those|When|Where|What|How)$/)) {
            competitorsSet.add(tool)
          }
        })
      } catch (promptError) {
        console.error(`[v0] Error testing prompt ${i + 1}:`, promptError)
        continue
      }
    }

    const result: VCSTestResult = {
      score: recommendationCount,
      totalTests: prompts.length,
      prompts: prompts,
      promptResults: promptResults,
      competitors: Array.from(competitorsSet).slice(0, 5),
      productMentioned: productMentioned,
    }

    return NextResponse.json({ result })
  } catch (error) {
    console.error("[v0] VCS Test API Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to test prompts",
      },
      { status: 500 },
    )
  }
}
