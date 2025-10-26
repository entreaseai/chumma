"use client"

import { Shader, ChromaFlow, Swirl } from "shaders/react"
import { CustomCursor } from "@/components/custom-cursor"
import { GrainOverlay } from "@/components/grain-overlay"
import { MagneticButton } from "@/components/magnetic-button"
import { useRef, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"

interface PromptTestResult {
  prompt: string
  mentioned: boolean
  response: string
}

interface VCSPromptResult {
  prompts: string[]
  productName: string
  toolContext: string
}

interface VCSTestResult {
  score: number
  totalTests: number
  prompts: string[]
  promptResults: PromptTestResult[]
  competitors: string[]
  productMentioned: boolean
}

const setCurrentProcessingTab = (tab: "oneshot" | "vcs" | "cursor") => {
  // This function is used to set the current processing tab
  // It should be implemented based on the application's state management
  console.log(`Current processing tab set to: ${tab}`)
}

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState<"oneshot" | "vcs" | "cursor">(() => {
    const randomNum = Math.floor(Math.random() * 3) + 1
    return randomNum === 1 ? "vcs" : randomNum === 2 ? "oneshot" : "cursor"
  })
  const [vcsInput, setVcsInput] = useState("")
  const [oneshotInput, setOneshotInput] = useState("")
  const [cursorInput, setCursorInput] = useState("")
  const [cursorResult, setCursorResult] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [processedUrl, setProcessedUrl] = useState("")
  const [apiResult, setApiResult] = useState<string>("")
  const [vcsResult, setVcsResult] = useState<VCSTestResult | null>(null)
  const [vcsPrompts, setVcsPrompts] = useState<string[]>([])
  const [vcsProductName, setVcsProductName] = useState<string>("")
  const [vcsTestingProgress, setVcsTestingProgress] = useState<number>(0)
  const [vcsPromptResults, setVcsPromptResults] = useState<PromptTestResult[]>([])
  const currentProcessingTab = useRef<"oneshot" | "vcs" | "cursor">("vcs").current
  const shaderContainerRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return false
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const startVcsProcessing = async (url: string) => {
    setProcessedUrl(url)
    setCurrentProcessingTab("vcs")
    setIsProcessing(true)
    setShowSuccess(false)
    setVcsResult(null)
    setVcsPrompts([])
    setVcsProductName("")
    setVcsTestingProgress(0)
    setVcsPromptResults([])

    try {
      // Phase 1: Generate prompts
      console.log("[v0] Phase 1: Generating prompts...")
      const analyzeResponse = await fetch("/api/vcs-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ link: url }),
      })

      const analyzeData = await analyzeResponse.json()

      if (!analyzeResponse.ok) {
        throw new Error(analyzeData.error || "Failed to generate prompts")
      }

      const { prompts, productName } = analyzeData.result as VCSPromptResult
      setVcsPrompts(prompts)
      setVcsProductName(productName)

      console.log("[v0] Phase 2: Testing prompts sequentially...")

      // Phase 2: Test each prompt sequentially
      const promptResults: PromptTestResult[] = []
      const allCompetitors = new Set<string>()
      let mentionCount = 0

      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i]
        setVcsTestingProgress(i + 1)

        try {
          const testResponse = await fetch("/api/vcs-test-single", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt,
              productName,
              index: i,
            }),
          })

          const testData = await testResponse.json()

          if (!testData.success) {
            throw new Error(testData.error || "Failed to test prompt")
          }

          const { result } = testData
          promptResults.push({
            prompt: result.prompt,
            mentioned: result.mentioned,
            response: result.response,
          })

          if (result.mentioned) {
            mentionCount++
          }

          // Collect competitors
          if (result.competitors) {
            result.competitors.forEach((comp: string) => allCompetitors.add(comp))
          }

          // Update results progressively
          setVcsPromptResults([...promptResults])
        } catch (error) {
          console.error(`[v0] Error testing prompt ${i + 1}:`, error)
          promptResults.push({
            prompt,
            mentioned: false,
            response: `Error: ${error instanceof Error ? error.message : "Failed to test prompt"}`,
          })
        }
      }

      // Final results
      const finalResult: VCSTestResult = {
        score: mentionCount,
        totalTests: prompts.length,
        prompts,
        promptResults,
        competitors: Array.from(allCompetitors).slice(0, 15),
        productMentioned: mentionCount > 0,
      }

      setVcsResult(finalResult)
      setIsProcessing(false)
      setShowSuccess(true)

      console.log("[v0] VCS Testing Complete:", {
        score: finalResult.score,
        totalTests: finalResult.totalTests,
      })
    } catch (error) {
      console.error("VCS API Error:", error)
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: "There was an error analyzing your tool. Please try again.",
      })
      setIsProcessing(false)
    }
  }

  const startOneshotProcessing = async (url: string) => {
    setProcessedUrl(url)
    setCurrentProcessingTab("oneshot")
    setIsProcessing(true)
    setShowSuccess(false)
    setApiResult("")

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ link: url, type: "oneshot" }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze")
      }

      setApiResult(data.result)
      setIsProcessing(false)
      setShowSuccess(true)
    } catch (error) {
      console.error("API Error:", error)
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: "There was an error generating your prompt. Please try again.",
      })
      setIsProcessing(false)
    }
  }

  const handleVcsAnalyze = () => {
    if (!isValidUrl(vcsInput)) {
      toast({
        variant: "destructive",
        title: "Invalid link",
        description: "Please enter a valid URL to analyze your tool.",
      })
      return
    }
    startVcsProcessing(vcsInput)
  }

  const handleOneShot = () => {
    if (!isValidUrl(oneshotInput)) {
      toast({
        variant: "destructive",
        title: "Invalid link",
        description: "Please enter a valid URL to generate your one-shot prompt.",
      })
      return
    }
    startOneshotProcessing(oneshotInput)
  }

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(apiResult)
      toast({
        title: "Copied!",
        description: "One-shot prompt copied to clipboard.",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Failed to copy to clipboard. Please try again.",
      })
    }
  }

  const handleCursorAgent = async () => {
    if (!cursorInput.trim()) {
      toast({
        variant: "destructive",
        title: "Empty prompt",
        description: "Please enter a prompt for the Cursor agent.",
      })
      return
    }

    setCurrentProcessingTab("cursor")
    setIsProcessing(true)
    setShowSuccess(false)
    setCursorResult("")

    try {
      const createResponse = await fetch("/api/cursor-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: cursorInput,
        }),
      })

      const createData = await createResponse.json()

      if (!createData.success) {
        throw new Error("Failed to create agent")
      }

      const pollResponse = await fetch("/api/cursor-agent/poll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: createData.agentId,
        }),
      })

      const pollData = await pollResponse.json()

      if (!pollData.success) {
        throw new Error(pollData.error || "Failed to get agent result")
      }

      setCursorResult(pollData.answer)
      setIsProcessing(false)
      setShowSuccess(true)
    } catch (error) {
      console.error("Cursor Agent Error:", error)
      toast({
        variant: "destructive",
        title: "Agent failed",
        description: "There was an error processing your request. Please try again.",
      })
      setIsProcessing(false)
    }
  }

  const handleReset = () => {
    setShowSuccess(false)
    setIsProcessing(false)
    setVcsInput("")
    setOneshotInput("")
    setCursorInput("")
    setProcessedUrl("")
    setApiResult("")
    setVcsResult(null)
    setVcsPrompts([])
    setVcsProductName("")
    setVcsTestingProgress(0)
    setVcsPromptResults([])
    setCursorResult("")
  }

  const handleDownloadReport = () => {
    if (!vcsResult) return

    const headers = ["Prompt #", "Prompt Text", "Mentioned", "Response"]
    const csvRows = [headers.join(",")]

    vcsResult.promptResults.forEach((result, index) => {
      const row = [
        (index + 1).toString(),
        `"${result.prompt.replace(/"/g, '""')}"`,
        result.mentioned ? "Yes" : "No",
        `"${result.response.replace(/"/g, '""')}"`,
      ]
      csvRows.push(row.join(","))
    })

    const csvContent = csvRows.join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)

    link.setAttribute("href", url)
    link.setAttribute("download", `vibe-coder-score-report-${Date.now()}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Report downloaded!",
      description: "Your VCS report has been saved as a CSV file.",
    })
  }

  useEffect(() => {
    const checkShaderReady = () => {
      if (shaderContainerRef.current) {
        const canvas = shaderContainerRef.current.querySelector("canvas")
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          setIsLoaded(true)
          return true
        }
      }
      return false
    }

    if (checkShaderReady()) return

    const intervalId = setInterval(() => {
      if (checkShaderReady()) {
        clearInterval(intervalId)
      }
    }, 100)

    const fallbackTimer = setTimeout(() => {
      setIsLoaded(true)
    }, 1500)

    return () => {
      clearInterval(intervalId)
      clearTimeout(fallbackTimer)
    }
  }, [])

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background">
      <CustomCursor />
      <GrainOverlay />

      {!isProcessing && !showSuccess && (
        <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 md:top-8">
          <div className="flex gap-1 rounded-full border border-foreground/20 bg-background/50 p-1 backdrop-blur-sm md:gap-2">
            <button
              onClick={() => setActiveTab("vcs")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all md:px-6 md:py-2 md:text-sm ${
                activeTab === "vcs" ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              Vibe Code Score
            </button>
            <button
              onClick={() => setActiveTab("oneshot")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all md:px-6 md:py-2 md:text-sm ${
                activeTab === "oneshot" ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              One Shot
            </button>
            <button
              onClick={() => setActiveTab("cursor")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all md:px-6 md:py-2 md:text-sm ${
                activeTab === "cursor" ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              Ask Cursor
            </button>
          </div>
        </div>
      )}

      <div
        ref={shaderContainerRef}
        className={`fixed inset-0 z-0 transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        style={{ contain: "strict" }}
      >
        <Shader className="h-full w-full">
          <Swirl
            colorA="#1275d8"
            colorB="#e19136"
            speed={0.8}
            detail={0.8}
            blend={50}
            coarseX={40}
            coarseY={40}
            mediumX={40}
            mediumY={40}
            fineX={40}
            fineY={40}
          />
          <ChromaFlow
            baseColor="#0066ff"
            upColor="#0066ff"
            downColor="#d1d1d1"
            leftColor="#e19136"
            rightColor="#e19136"
            intensity={0.9}
            radius={1.8}
            momentum={25}
            maskType="alpha"
            opacity={0.97}
          />
        </Shader>
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {isProcessing && (
        <div
          className={`relative z-10 flex h-screen w-full items-center justify-center px-4 transition-opacity duration-700 md:px-12 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="max-w-2xl w-full text-center">
            <h2 className="text-xl md:text-3xl lg:text-4xl font-light text-foreground animate-pulse-subtle mb-3 md:mb-4">
              {currentProcessingTab === "vcs" && vcsTestingProgress > 0
                ? `testing prompt ${vcsTestingProgress} of ${vcsPrompts.length}...`
                : "maximizing vibe coder usage..."}
            </h2>
            <p className="text-xs md:text-sm text-foreground/60 animate-pulse-subtle mb-6 md:mb-8">
              {currentProcessingTab === "vcs" && vcsTestingProgress > 0
                ? "each prompt takes about 30-60 seconds"
                : "it might take 5 minutes"}
            </p>

            {currentProcessingTab === "vcs" && vcsTestingProgress > 0 && vcsPrompts.length > 0 && (
              <div className="mx-auto max-w-md">
                <div className="mb-2 flex justify-between text-xs md:text-sm text-foreground/70">
                  <span>Progress</span>
                  <span>
                    {vcsTestingProgress} / {vcsPrompts.length}
                  </span>
                </div>
                <div className="h-2 md:h-3 w-full rounded-full bg-foreground/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#1275d8] to-[#e19136] transition-all duration-500 ease-out"
                    style={{
                      width: `${(vcsTestingProgress / vcsPrompts.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSuccess && currentProcessingTab === "vcs" && vcsResult && (
        <div
          className={`relative z-10 flex h-screen w-full items-center justify-center px-4 transition-opacity duration-700 md:px-6 lg:px-12 overflow-y-auto py-20 md:py-24 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="max-w-6xl w-full mt-8 md:mt-12">
            <div className="text-center mb-6 md:mb-8">
              <div className="mb-4 md:mb-8 inline-flex h-14 w-14 md:h-20 md:w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#1275d8] to-[#e19136] animate-in zoom-in duration-500">
                <svg
                  className="h-7 w-7 md:h-10 md:w-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>

              <h1 className="mb-3 md:mb-4 animate-in fade-in slide-in-from-bottom-4 font-sans text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-light leading-[1.1] tracking-tight text-foreground duration-700">
                <span className="text-balance">Vibe Coder Score Analysis</span>
              </h1>

              <div className="mb-6 md:mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <div className="inline-flex items-baseline gap-2">
                  <span className="text-5xl md:text-7xl font-bold text-foreground">{vcsResult.score}</span>
                  <span className="text-2xl md:text-3xl text-foreground/60">/ {vcsResult.totalTests}</span>
                </div>
                <p className="mt-2 text-sm md:text-lg text-foreground/70 px-4">
                  Your tool was recommended {vcsResult.score} out of {vcsResult.totalTests} times by Cursor agents
                </p>
              </div>
            </div>

            <div className="mb-4 md:mb-6 mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
              <div className="rounded-xl border border-foreground/20 bg-background/80 backdrop-blur-md p-4 md:p-6">
                <h3 className="text-xs md:text-sm font-medium text-foreground/70 mb-2">Product Visibility</h3>
                <p className="text-xl md:text-2xl font-semibold text-foreground">
                  {vcsResult.productMentioned ? "✓ Mentioned" : "✗ Not Found"}
                </p>
                <p className="text-xs md:text-sm text-foreground/60 mt-1">
                  {vcsResult.productMentioned
                    ? "Your product appeared in Cursor recommendations"
                    : "Your product was not mentioned in test results"}
                </p>
              </div>
            </div>

            <div className="mb-4 md:mb-6 mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
              <div className="rounded-xl border border-foreground/20 bg-background/80 backdrop-blur-md overflow-hidden">
                <div className="border-b border-foreground/10 bg-foreground/5 px-4 md:px-6 py-2 md:py-3">
                  <span className="text-xs md:text-sm font-medium text-foreground/70">Detailed Test Results</span>
                </div>
                <div className="max-h-[40vh] md:max-h-[50vh] overflow-y-auto overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="sticky top-0 bg-foreground/5 border-b border-foreground/10">
                      <tr>
                        <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-medium text-foreground/70 uppercase tracking-wider w-8 md:w-12">
                          #
                        </th>
                        <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-medium text-foreground/70 uppercase tracking-wider">
                          Prompt
                        </th>
                        <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-medium text-foreground/70 uppercase tracking-wider w-20 md:w-32">
                          Mentioned
                        </th>
                        <th className="px-2 md:px-4 py-2 md:py-3 text-left text-[10px] md:text-xs font-medium text-foreground/70 uppercase tracking-wider">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/10">
                      {vcsResult.promptResults.map((result, index) => (
                        <tr key={index} className="hover:bg-foreground/5 transition-colors">
                          <td className="px-2 md:px-4 py-3 md:py-4 text-xs md:text-sm text-foreground/50 font-medium">
                            {(index + 1).toString().padStart(2, "0")}
                          </td>
                          <td className="px-2 md:px-4 py-3 md:py-4 text-xs md:text-sm text-foreground/80">
                            {result.prompt}
                          </td>
                          <td className="px-2 md:px-4 py-3 md:py-4 text-xs md:text-sm">
                            <span
                              className={`inline-flex items-center px-1.5 md:px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium ${
                                result.mentioned ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {result.mentioned ? "✓ Yes" : "✗ No"}
                            </span>
                          </td>
                          <td className="px-2 md:px-4 py-3 md:py-4 text-xs md:text-sm text-foreground/70 max-w-xs md:max-w-md">
                            <div className="line-clamp-3 hover:line-clamp-none transition-all cursor-pointer">
                              {result.response}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {vcsResult.competitors.length > 0 && (
              <div className="mb-4 md:mb-6 mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-250">
                <div className="rounded-xl border border-foreground/20 bg-background/80 backdrop-blur-md p-4 md:p-6">
                  <h3 className="text-xs md:text-sm font-medium text-foreground/70 mb-3 md:mb-4">
                    Competitors Detected ({vcsResult.competitors.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {vcsResult.competitors.map((competitor, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1.5 rounded-full text-xs md:text-sm font-medium bg-foreground/10 text-foreground/80 border border-foreground/20"
                      >
                        {competitor}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-foreground/50 mt-3">
                    These tools were mentioned in Cursor agent responses when testing your prompts
                  </p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row animate-in fade-in slide-in-from-bottom-4 justify-center gap-3 md:gap-4 duration-700 delay-300 mb-8">
              <MagneticButton size="default" variant="secondary" onClick={handleDownloadReport}>
                Download Report
              </MagneticButton>
              <MagneticButton size="default" variant="primary" onClick={handleReset}>
                Analyze Another Tool
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {showSuccess && currentProcessingTab === "oneshot" && (
        <div
          className={`relative z-10 flex h-screen w-full items-center justify-center px-4 transition-opacity duration-700 md:px-6 lg:px-12 overflow-y-auto py-20 md:py-24 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="max-w-5xl w-full mt-8 md:mt-12">
            <div className="text-center mb-6 md:mb-8">
              <div className="mb-4 md:mb-8 inline-flex h-14 w-14 md:h-20 md:w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#1275d8] to-[#e19136] animate-in zoom-in duration-500">
                <svg
                  className="h-7 w-7 md:h-10 md:w-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="mb-3 md:mb-4 animate-in fade-in slide-in-from-bottom-4 font-sans text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-light leading-[1.1] tracking-tight text-foreground duration-700">
                <span className="text-balance">One Shot Prompt Generated!</span>
              </h1>

              <p className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-sm md:text-base leading-relaxed text-foreground/70 duration-700 delay-150 px-4">
                <span className="text-pretty">
                  Add this prompt to your documentation so vibe coders can one-shot setup your tool with Cursor.
                </span>
              </p>
            </div>

            <div className="mb-4 md:mb-6 mx-auto max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
              <div className="relative rounded-xl border border-foreground/20 bg-background/80 backdrop-blur-md overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/10 bg-foreground/5 px-4 md:px-6 py-2 md:py-3">
                  <span className="text-xs md:text-sm font-medium text-foreground/70">Your One-Shot Setup Prompt</span>
                  <button
                    onClick={handleCopyPrompt}
                    className="flex items-center gap-1.5 md:gap-2 rounded-lg bg-foreground/10 px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium text-foreground transition-all hover:bg-foreground/20 active:scale-95"
                  >
                    <svg
                      className="h-3 w-3 md:h-4 md:w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy
                  </button>
                </div>
                <div className="max-h-[40vh] md:max-h-[50vh] overflow-y-auto p-4 md:p-6">
                  <pre className="text-xs md:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-mono">
                    {apiResult || "Generating your prompt..."}
                  </pre>
                </div>
              </div>
            </div>

            <div className="flex animate-in fade-in slide-in-from-bottom-4 justify-center gap-3 md:gap-4 duration-700 delay-200 mb-8">
              <MagneticButton size="default" variant="primary" onClick={handleReset}>
                Generate Another Prompt
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {showSuccess && currentProcessingTab === "cursor" && (
        <div
          className={`relative z-10 flex h-screen w-full items-center justify-center px-4 transition-opacity duration-700 md:px-6 lg:px-12 overflow-y-auto py-20 md:py-24 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="max-w-5xl w-full mt-8 md:mt-12">
            <div className="text-center mb-6 md:mb-8">
              <div className="mb-4 md:mb-8 inline-flex h-14 w-14 md:h-20 md:w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#1275d8] to-[#e19136] animate-in zoom-in duration-500">
                <svg
                  className="h-7 w-7 md:h-10 md:w-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="mb-3 md:mb-4 animate-in fade-in slide-in-from-bottom-4 font-sans text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-light leading-[1.1] tracking-tight text-foreground duration-700">
                <span className="text-balance">Cursor Agent Response</span>
              </h1>

              <p className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-sm md:text-base leading-relaxed text-foreground/70 duration-700 delay-150 px-4">
                <span className="text-pretty">Here's what the Cursor agent found for you.</span>
              </p>
            </div>

            <div className="mb-4 md:mb-6 mx-auto max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
              <div className="relative rounded-xl border border-foreground/20 bg-background/80 backdrop-blur-md overflow-hidden">
                <div className="flex items-center justify-between border-b border-foreground/10 bg-foreground/5 px-4 md:px-6 py-2 md:py-3">
                  <span className="text-xs md:text-sm font-medium text-foreground/70">Agent Answer</span>
                </div>
                <div className="max-h-[40vh] md:max-h-[50vh] overflow-y-auto p-4 md:p-6">
                  <div className="text-xs md:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {cursorResult || "Processing your request..."}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex animate-in fade-in slide-in-from-bottom-4 justify-center gap-3 md:gap-4 duration-700 delay-200 mb-8">
              <MagneticButton size="default" variant="primary" onClick={handleReset}>
                Ask Another Question
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {!isProcessing && !showSuccess && activeTab === "vcs" && (
        <div
          className={`relative z-10 flex h-screen w-full items-center justify-center px-4 transition-opacity duration-700 md:px-6 lg:px-12 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="max-w-4xl text-center">
            <h1 className="mb-4 md:mb-6 animate-in fade-in slide-in-from-bottom-8 font-sans text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-light leading-[1.1] tracking-tight text-foreground duration-1000">
              <span className="text-balance">
                Measure Your Tool's Vibe Coder
                <br />
                Adoption Potential
              </span>
            </h1>

            <p className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-sm md:text-lg lg:text-xl leading-relaxed text-foreground/90 duration-1000 delay-200 px-4">
              <span className="text-pretty">
                The Vibe Coder Score measures how likely your tool—like Cursor and other vibe coding tools—is to get
                recommended by the vibe coding community.
              </span>
            </p>

            <div className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <input
                type="text"
                value={vcsInput}
                onChange={(e) => setVcsInput(e.target.value)}
                placeholder="Enter a link to your product's doc"
                className="w-full rounded-lg border border-foreground/20 bg-background/50 px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base text-foreground backdrop-blur-sm transition-all placeholder:text-foreground/50 focus:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            <div className="flex animate-in fade-in slide-in-from-bottom-4 justify-center duration-1000 delay-500">
              <MagneticButton size="default" variant="primary" onClick={handleVcsAnalyze}>
                Analyze My Tool
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {!isProcessing && !showSuccess && activeTab === "oneshot" && (
        <div
          className={`relative z-10 flex h-screen w-full items-center justify-center px-4 transition-opacity duration-700 md:px-6 lg:px-12 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="max-w-4xl text-center">
            <h1 className="mb-4 md:mb-6 animate-in fade-in slide-in-from-bottom-8 font-sans text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-light leading-[1.1] tracking-tight text-foreground duration-1000">
              <span className="text-balance">
                One Shot Your Tool's Adoption
                <br />
                For Vibe Coders
              </span>
            </h1>

            <p className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-sm md:text-base leading-relaxed text-foreground/90 duration-1000 delay-200 px-4">
              <span className="text-pretty">
                Vibe coders don't read docs—but Cursor does. One Shot Vibes creates a prompt that you can add to your
                docs that lets your vibe coders one-shot setup your tool.
              </span>
            </p>

            <div className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <input
                type="text"
                value={oneshotInput}
                onChange={(e) => setOneshotInput(e.target.value)}
                placeholder="Enter a link to your product's doc"
                className="w-full rounded-lg border border-foreground/20 bg-background/50 px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base text-foreground backdrop-blur-sm transition-all placeholder:text-foreground/50 focus:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            <div className="flex animate-in fade-in slide-in-from-bottom-4 justify-center duration-1000 delay-500">
              <MagneticButton size="default" variant="primary" onClick={handleOneShot}>
                One Shot
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {!isProcessing && !showSuccess && activeTab === "cursor" && (
        <div
          className={`relative z-10 flex h-screen w-full items-center justify-center px-4 transition-opacity duration-700 md:px-6 lg:px-12 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="max-w-4xl text-center">
            <h1 className="mb-4 md:mb-6 animate-in fade-in slide-in-from-bottom-8 font-sans text-2xl md:text-4xl lg:text-5xl xl:text-6xl font-light leading-[1.1] tracking-tight text-foreground duration-1000">
              <span className="text-balance">
                Ask Cursor Agent
                <br />
                Anything
              </span>
            </h1>

            <p className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-sm md:text-base leading-relaxed text-foreground/90 duration-1000 delay-200 px-4">
              <span className="text-pretty">
                Send a prompt to the Cursor Background Agent and get intelligent responses powered by AI.
              </span>
            </p>

            <div className="mb-6 md:mb-8 mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
              <input
                type="text"
                value={cursorInput}
                onChange={(e) => setCursorInput(e.target.value)}
                placeholder="Enter your prompt for Cursor agent..."
                className="w-full rounded-lg border border-foreground/20 bg-background/50 px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base text-foreground backdrop-blur-sm transition-all placeholder:text-foreground/50 focus:border-foreground/40 focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            <div className="flex animate-in fade-in slide-in-from-bottom-4 justify-center duration-1000 delay-500">
              <MagneticButton size="default" variant="primary" onClick={handleCursorAgent}>
                Send to Cursor
              </MagneticButton>
            </div>
          </div>
        </div>
      )}

      {!isProcessing && !showSuccess && (
        <div className="absolute bottom-4 md:bottom-6 left-1/2 z-20 -translate-x-1/2 px-4">
          <a
            href="mailto:kasatkunanathan@gmail.com"
            className="text-xs md:text-sm text-foreground/50 transition-colors hover:text-foreground/80 text-center block"
          >
            Contact us to maximize successful vibe coder adoption
          </a>
        </div>
      )}
    </main>
  )
}
