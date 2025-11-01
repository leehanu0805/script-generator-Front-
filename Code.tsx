// Enhanced 4-step AI Idea Generator with Premium UI/UX - ALL FIXES APPLIED
import {
    useState,
    startTransition,
    useEffect,
    useCallback,
    useRef,
    useMemo,
    type CSSProperties,
} from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer, motion, AnimatePresence } from "framer"

// Z-INDEX 체계화
const Z_INDEX = {
    CONFETTI: 9999,
    MODAL: 1000,
    DROPDOWN: 100,
    TOOLTIP: 50,
    CLOSE_BUTTON: 10,
}

// Timing constants
const TIMINGS = {
    CHAR_TYPING: 25,           // Character typing speed (ms)
    CHAT_RESPONSE_DELAY: 800,  // Delay before AI response (ms)
    STEP_TRANSITION: 1500,     // Step transition delay (ms)
    CONFETTI_DURATION: 1500,   // Confetti display time (ms) - reduced for better UX
    LOADING_MSG_ROTATION: 3000,// Loading message rotation (ms)
    FETCH_TIMEOUT: 60000,      // API fetch timeout (ms)
    LONG_FETCH_TIMEOUT: 90000, // Extended fetch timeout (ms)
    PROGRESS_UPDATE: 500,      // Progress bar update interval (ms)
}

// [FIX 9] 버튼 공통 스타일 상수
const BUTTON_STYLES = {
    base: {
        transition: "all 0.2s ease",
        cursor: "pointer",
        border: "none",
    },
    primary: (primaryColor: string, textOnPrimary: string) => ({
        background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}ee 100%)`,
        color: textOnPrimary,
    }),
    secondary: (cardColor: string, textColor: string) => ({
        backgroundColor: cardColor,
        border: `1.5px solid ${textColor}65`,
        color: textColor,
    }),
    disabled: (textColor: string) => ({
        backgroundColor: "transparent",
        border: `2px solid ${textColor}25`,
        color: `${textColor}60`,
        cursor: "not-allowed",
    }),
}

// Font configuration type
interface FontConfig {
    fontSize: string
    variant?: string
    fontWeight?: number
    letterSpacing?: string
    lineHeight?: string
}

interface IdeaGeneratorProps {
    backgroundColor: string
    cardColor: string
    primaryColor: string
    textColor: string
    accentColor: string
    headingFont: FontConfig
    bodyFont: FontConfig
    buttonFont: FontConfig
    preview: boolean
    style?: CSSProperties
}

// [FIX 3] 명확한 타입 정의
interface ApiResult {
    script?: string
    transitions?: Array<{
        time: string
        type: string
        description: string
    }>
    bRoll?: Array<{
        timeRange: string
        content: string
    }>
    textOverlays?: Array<{
        time: string
        text: string
        style: string
    }>
    soundEffects?: Array<{
        time: string
        effect: string
    }>
}

interface HoveredPopup {
    type: "transition" | "broll"
    content: {
        time?: string
        type?: string
        description?: string
        timeRange?: string
        content?: string
    }
    x: number
    y: number
}

interface ChatOption {
    id: string
    type: "ai" | "user"
    content: string
    options?: string[]
    timestamp: number
}

interface ChatMessage {
    id: string
    type: "ai" | "user"
    content: string
    options?: string[]
    timestamp: number
}

type ErrorType = "network" | "timeout" | "server" | "unknown"

interface ApiError {
    type: ErrorType
    message: string
    retryable: boolean
}

type Step = 1 | 2 | 3 | 3.5 | 4

interface ModalConfig {
    show: boolean
    title: string
    message: string
    type: "alert" | "confirm"
    onConfirm?: () => void
    onCancel?: () => void
}

// Helper function: pick readable text color on a given background
const getReadableTextOn = (hex: string) => {
    // 안전장치
    if (!/^#([0-9a-f]{6})$/i.test(hex)) return "#000000"
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    // 감마 보정 포함한 상대 휘도 (더 안정적)
    const L =
        0.2126 * (r / 255) ** 2.4 +
        0.7152 * (g / 255) ** 2.4 +
        0.0722 * (b / 255) ** 2.4
    // 밝은 배경이면 검정, 어두운 배경이면 흰색
    return L > 0.35 ? "#000000" : "#FFFFFF"
}

// 공통 스타일 상수
const WORD_BREAK_STYLE = {
    wordBreak: "break-word" as const,
    overflowWrap: "break-word" as const,
}

export default function IdeaGenerator(props: IdeaGeneratorProps) {
    const {
        backgroundColor,
        cardColor,
        primaryColor,
        textColor,
        accentColor,
        headingFont,
        bodyFont,
        buttonFont,
        preview,
    } = props

    // Window width state - initialized with actual value to avoid re-render
    const [windowWidth, setWindowWidth] = useState(
        typeof window !== "undefined" ? window.innerWidth : 768
    )

    const [isExpanded, setIsExpanded] = useState(false)
    const [currentStep, setCurrentStep] = useState<Step>(1)
    const [selectedStyle, setSelectedStyle] = useState("")
    const [customStyleName, setCustomStyleName] = useState("")
    const [broadTopic, setBroadTopic] = useState("")
    const [keyword, setKeyword] = useState("")

    const [scriptLength, setScriptLength] = useState(45)
    const [showCustomLength, setShowCustomLength] = useState(false)
    const scriptSegments = [15, 30, 45, 60, 90, 120, 180]

    const [selectedLanguage, setSelectedLanguage] = useState("Select")
    const [selectedTone, setSelectedTone] = useState("Select")
    const [ctaInclusion, setCtaInclusion] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)
    const [hoveredPopup, setHoveredPopup] = useState<HoveredPopup | null>(null)

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [userInput, setUserInput] = useState("")
    const [isTyping, setIsTyping] = useState(false)
    const [skipRefinement, setSkipRefinement] = useState(false)
    const [showSkipConfirm, setShowSkipConfirm] = useState(false)
    const [questionFetchFailed, setQuestionFetchFailed] = useState(false)
    const hasAttemptedQuestionFetch = useRef(false)
    const chatScrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const [typingText, setTypingText] = useState("")
    const typingTimeoutRef = useRef<number | null>(null)

    // Message ID counter to avoid duplicates
    const messageIdCounter = useRef(0)
    const generateMessageId = () => {
        messageIdCounter.current += 1
        return `msg_${Date.now()}_${messageIdCounter.current}`
    }

    const [apiResults, setApiResults] = useState<string | ApiResult | null>(
        null
    )
    const [isLoading, setIsLoading] = useState(false)
    const [apiError, setApiError] = useState<ApiError | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [loadingProgress, setLoadingProgress] = useState(0)
    const [estimatedTime, setEstimatedTime] = useState(0)

    const [scoreExpanded, setScoreExpanded] = useState(true)
    const [scoreData, setScoreData] = useState<{
        overall: number
        creativity: number
        engagement: number
        clarity: number
        timing: number
    } | null>(null)

    const [isEditMode, setIsEditMode] = useState(false)
    const [editedScript, setEditedScript] = useState("")
    const [regenerateRequest, setRegenerateRequest] = useState("")

    const [showSidePanel, setShowSidePanel] = useState(false)

    const [showConfetti, setShowConfetti] = useState(false)

    const [showMoreActions, setShowMoreActions] = useState(false)
    const moreActionsRef = useRef<HTMLDivElement>(null)

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

    // Language 확장 state
    const [showAllLanguages, setShowAllLanguages] = useState(false)

    // Modal state for replacing alert/confirm
    const [modalConfig, setModalConfig] = useState<ModalConfig>({
        show: false,
        title: "",
        message: "",
        type: "alert",
    })

    const isStatic = useIsStaticRenderer()

    // Window resize listener
    useEffect(() => {
        if (typeof window === "undefined") return

        const handleResize = () => {
            setWindowWidth(window.innerWidth)
        }

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    // 다크모드 대응 색상 헬퍼
    const isDarkMode = useMemo(() => {
        const r = parseInt(textColor.slice(1, 3), 16)
        const g = parseInt(textColor.slice(3, 5), 16)
        const b = parseInt(textColor.slice(5, 7), 16)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        return luminance > 0.5
    }, [textColor])

    const textOnPrimary = useMemo(
        () => getReadableTextOn(primaryColor),
        [primaryColor]
    )

    const videoStyles = [
        { id: "meme", title: "Meme", description: "Trending/funny clips" },
        {
            id: "quicktip",
            title: "Quick Tip",
            description: "Fast practical tips",
        },
        {
            id: "challenge",
            title: "Challenge",
            description: "Viral experiments",
        },
        {
            id: "storytelling",
            title: "Storytelling",
            description: "Short personal stories",
        },
        {
            id: "productplug",
            title: "Product Plug",
            description: "Natural product use",
        },
        {
            id: "faceless",
            title: "Faceless",
            description: "Voiceover/TTS only",
        },
        { id: "other", title: "Other", description: "Custom style" },
    ]

    const toneOptions = [
        { value: "Neutral", emoji: "😐", desc: "Balanced" },
        { value: "Casual", emoji: "😊", desc: "Relaxed" },
        { value: "Professional", emoji: "🎩", desc: "Formal" },
        { value: "Friendly", emoji: "🤗", desc: "Warm" },
        { value: "Formal", emoji: "👔", desc: "Official" },
        { value: "Humorous", emoji: "😂", desc: "Funny" },
        { value: "Serious", emoji: "🤔", desc: "Thoughtful" },
        { value: "Enthusiastic", emoji: "🎉", desc: "Energetic" },
    ]

    const allLanguages = [
        { name: "English", flag: "🇺🇸" },
        { name: "Spanish", flag: "🇪🇸" },
        { name: "French", flag: "🇫🇷" },
        { name: "German", flag: "🇩🇪" },
        { name: "Italian", flag: "🇮🇹" },
        { name: "Portuguese", flag: "🇵🇹" },
        { name: "Dutch", flag: "🇳🇱" },
        { name: "Russian", flag: "🇷🇺" },
        { name: "Chinese", flag: "🇨🇳" },
        { name: "Japanese", flag: "🇯🇵" },
        { name: "Korean", flag: "🇰🇷" },
        { name: "Arabic", flag: "🇸🇦" },
    ] as const

    const popularLanguages = allLanguages.slice(0, 6)
    const languages = showAllLanguages ? allLanguages : popularLanguages

    const LANGUAGE_CODE: Record<string, string> = {
        English: "en",
        Spanish: "es",
        French: "fr",
        German: "de",
        Italian: "it",
        Portuguese: "pt",
        Dutch: "nl",
        Russian: "ru",
        Chinese: "zh",
        Japanese: "ja",
        Korean: "ko",
        Arabic: "ar",
    }

    const loadingMessages = [
        "🎬 Crafting your script...",
        "🤖 AI is working hard...",
        "✨ Adding creativity...",
        "📝 Writing content...",
        "🎯 Perfecting details...",
        "🚀 Almost done...",
    ]
    const [currentLoadingMsg, setCurrentLoadingMsg] = useState(
        loadingMessages[0]
    )

    // [FIX 8] Auto-save with error handling
    useEffect(() => {
        if (!isExpanded) return

        const state = {
            currentStep,
            selectedStyle,
            customStyleName,
            broadTopic,
            keyword,
            scriptLength,
            selectedLanguage,
            selectedTone,
            ctaInclusion,
            chatMessages,
            timestamp: Date.now(),
        }

        try {
            sessionStorage.setItem("ideaGenerator_state", JSON.stringify(state))
        } catch (e) {
            console.error("Failed to save state:", e)
            setModalConfig({
                show: true,
                title: "Auto-save Failed",
                message: "Failed to auto-save your progress. Please check your browser storage settings.",
                type: "alert",
                onConfirm: () => setModalConfig(prev => ({ ...prev, show: false })),
            })
        }
    }, [
        isExpanded,
        currentStep,
        selectedStyle,
        customStyleName,
        broadTopic,
        keyword,
        scriptLength,
        selectedLanguage,
        selectedTone,
        ctaInclusion,
        chatMessages,
    ])

    // [FIX 8] Restore with error handling
    useEffect(() => {
        if (isExpanded) return

        try {
            const saved = sessionStorage.getItem("ideaGenerator_state")
            if (saved) {
                const state = JSON.parse(saved)
                // [FIX 8] timestamp 없으면 복구 안 함
                if (!state.timestamp) return

                const age = Date.now() - state.timestamp
                if (age < 3600000) {
                    setCurrentStep(state.currentStep)
                    setSelectedStyle(state.selectedStyle)
                    setCustomStyleName(state.customStyleName)
                    setBroadTopic(state.broadTopic)
                    setKeyword(state.keyword)
                    setScriptLength(state.scriptLength)
                    setSelectedLanguage(state.selectedLanguage)
                    setSelectedTone(state.selectedTone)
                    setCtaInclusion(state.ctaInclusion)
                    setChatMessages(state.chatMessages)
                    setHasUnsavedChanges(true)
                }
            }
        } catch (e) {
            console.error("Failed to restore state:", e)
            setModalConfig({
                show: true,
                title: "Restore Failed",
                message: "Failed to restore your previous session. Starting fresh.",
                type: "alert",
                onConfirm: () => setModalConfig(prev => ({ ...prev, show: false })),
            })
        }
    }, [isExpanded])

    // Rotate loading messages
    useEffect(() => {
        if (!isLoading) return
        const interval = setInterval(() => {
            setCurrentLoadingMsg(
                loadingMessages[
                    Math.floor(Math.random() * loadingMessages.length)
                ]
            )
        }, 3000)
        return () => clearInterval(interval)
    }, [isLoading])

    // Close dropdown
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                moreActionsRef.current &&
                !moreActionsRef.current.contains(e.target as Node)
            ) {
                setShowMoreActions(false)
            }
        }
        if (showMoreActions) {
            document.addEventListener("mousedown", handleClickOutside)
            return () =>
                document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [showMoreActions])

    const safeJsonParse = (t: string) => {
        try {
            return JSON.parse(t)
        } catch {
            return t
        }
    }

    const normalizeResult = (input: any): string | ApiResult => {
        if (input == null) return ""
        if (typeof input === "string") return input
        if (typeof input === "object") {
            if (typeof (input as any).result === "string")
                return (input as any).result
            if (
                (input as any).result &&
                typeof (input as any).result === "object"
            )
                return (input as any).result
            if (
                (input as any).result &&
                typeof (input as any).result.content === "string"
            )
                return (input as any).result.content
            return input
        }
        return String(input)
    }

    const createApiError = (error: any): ApiError => {
        if (error?.name === "AbortError") {
            return {
                type: "timeout",
                message: "The request timed out. Please try again in a moment.",
                retryable: true,
            }
        }

        if (!navigator.onLine) {
            return {
                type: "network",
                message: "Internet connection lost. Please check your network.",
                retryable: true,
            }
        }

        if (error?.message?.includes("HTTP 5")) {
            return {
                type: "server",
                message:
                    "The server is temporarily unavailable. Please try again shortly.",
                retryable: true,
            }
        }

        if (error?.message?.includes("HTTP 4")) {
            return {
                type: "server",
                message: "Bad request. Please check your input.",
                retryable: false,
            }
        }

        return {
            type: "unknown",
            message:
                error?.message || "Something went wrong. Please try again.",
            retryable: true,
        }
    }

    const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms))

    const fetchWithRetry = async (
        url: string,
        options: RequestInit,
        maxRetries = 3
    ): Promise<Response> => {
        let lastError: any

        for (let i = 0; i <= maxRetries; i++) {
            try {
                if (i > 0) {
                    const backoff = Math.min(1000 * Math.pow(2, i - 1), 8000)
                    await sleep(backoff)
                    setRetryCount(i)
                }

                const response = await fetch(url, options)

                if (response.status >= 500 && i < maxRetries) {
                    lastError = new Error(`HTTP ${response.status}`)
                    continue
                }

                return response
            } catch (error: any) {
                lastError = error
                if (error.name !== "AbortError" && i < maxRetries) {
                    continue
                }
                throw error
            }
        }

        throw lastError
    }

    // [FIX 2] 타이핑 애니메이션 개선 - cleanup 추가
    const cleanTextForTyping = useCallback((text: string): string => {
        let cleaned = text.trim()

        try {
            const parsed = JSON.parse(cleaned)
            if (typeof parsed === "string") {
                cleaned = parsed
            } else if (parsed.question) {
                cleaned = parsed.question
            } else if (parsed.content) {
                cleaned = parsed.content
            }
        } catch {
            // JSON이 아니면 그대로 사용
        }

        cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, "")

        return cleaned
    }, [])

    const typeMessage = useCallback(
        (text: string, callback: () => void) => {
            const cleanText = cleanTextForTyping(text)
            setTypingText("")
            setIsTyping(true)
            let index = 0

            // [FIX 2] 이전 타이머 정리
            if (typingTimeoutRef.current !== null) {
                clearTimeout(typingTimeoutRef.current)
                typingTimeoutRef.current = null
            }

            const type = () => {
                if (index < cleanText.length) {
                    setTypingText((prev) => prev + cleanText[index])
                    index++
                    typingTimeoutRef.current = window.setTimeout(
                        type,
                        TIMINGS.CHAR_TYPING
                    )
                } else {
                    setIsTyping(false)
                    typingTimeoutRef.current = null
                    callback()
                }
            }

            type()

            // [FIX 2] cleanup 함수 반환
            return () => {
                if (typingTimeoutRef.current !== null) {
                    clearTimeout(typingTimeoutRef.current)
                    typingTimeoutRef.current = null
                }
            }
        },
        [cleanTextForTyping]
    )

    const fetchNextQuestion = useCallback(async () => {
        const conversationHistory = chatMessages.map((msg) => {
            if (msg.type === "ai") {
                return {
                    role: "assistant",
                    question: msg.content,
                    ...(msg.options ? { options: msg.options } : {}),
                }
            } else {
                return {
                    role: "user",
                    answer: msg.content,
                }
            }
        })

        const requestData = {
            phase: "refinement-question-only",
            conversationHistory,
            keyword,
            style: selectedStyle === "other" ? customStyleName : selectedStyle,
            scriptLength,
            tone: selectedTone,
            language: LANGUAGE_CODE[selectedLanguage] || selectedLanguage,
        }

        try {
            const controller = new AbortController()
            const timer = setTimeout(
                () => controller.abort(),
                TIMINGS.FETCH_TIMEOUT
            )

            const res = await fetchWithRetry(
                "https://scripto-api.vercel.app/api/generate-content",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                    body: JSON.stringify(requestData),
                    signal: controller.signal,
                },
                2
            )

            clearTimeout(timer)

            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            return data
        } catch (e: any) {
            console.error("Question generation failed:", e)
            return { question: null, options: [] }
        }
    }, [
        chatMessages,
        keyword,
        selectedStyle,
        customStyleName,
        scriptLength,
        selectedTone,
        selectedLanguage,
    ])

    const calculateScores = useCallback(() => {
        if (!apiResults) return

        const scriptText =
            typeof apiResults === "string"
                ? apiResults
                : apiResults.script || ""
        const words = scriptText.split(" ").length
        const expectedWords = (scriptLength / 60) * 150

        const timingScore = Math.max(
            0,
            100 - (Math.abs(words - expectedWords) / expectedWords) * 100
        )

        const sentences = scriptText
            .split(/[.!?]+/)
            .filter((s) => s.trim().length > 0)
        const avgWordsPerSentence =
            sentences.length > 0 ? words / sentences.length : 15
        const clarityScore = Math.max(
            0,
            100 - Math.abs(avgWordsPerSentence - 15) * 5
        )

        const hasQuestions = /\?/.test(scriptText)
        const hasCTA =
            ctaInclusion &&
            (scriptText.toLowerCase().includes("subscribe") ||
                scriptText.toLowerCase().includes("follow") ||
                scriptText.toLowerCase().includes("like"))
        const engagementScore = 70 + (hasQuestions ? 15 : 0) + (hasCTA ? 15 : 0)

        const uniqueWords = new Set(scriptText.toLowerCase().split(/\W+/))
        const creativityScore = Math.min(100, (uniqueWords.size / words) * 200)

        const overall = Math.round(
            (timingScore + clarityScore + engagementScore + creativityScore) / 4
        )

        setScoreData({
            overall,
            creativity: Math.round(creativityScore),
            engagement: Math.round(engagementScore),
            clarity: Math.round(clarityScore),
            timing: Math.round(timingScore),
        })
    }, [apiResults, scriptLength, ctaInclusion])

    useEffect(() => {
        if (apiResults && (currentStep as number) === 4) {
            calculateScores()
        }
    }, [apiResults, currentStep, calculateScores])

    const regenerateWithEdit = useCallback(async () => {
        if (!regenerateRequest.trim()) return

        setIsLoading(true)
        setApiError(null)
        setScoreData(null)
        setLoadingProgress(0)
        setRetryCount(0)
        setEstimatedTime(25)

        const progressInterval = setInterval(() => {
            setLoadingProgress((prev) => Math.min(prev + 2, 90))
        }, 500)

        const requestData = {
            text: keyword + " - " + regenerateRequest,
            style: selectedStyle === "other" ? customStyleName : selectedStyle,
            length: scriptLength,
            tone: selectedTone,
            language: LANGUAGE_CODE[selectedLanguage] || selectedLanguage,
            ctaInclusion: ctaInclusion,
            outputType: "script",
            previousScript:
                editedScript ||
                (typeof apiResults === "string"
                    ? apiResults
                    : apiResults?.script),
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 90000)

        try {
            const response = await fetchWithRetry(
                "https://scripto-api.vercel.app/api/generate-content",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/plain, */*",
                    },
                    cache: "no-store",
                    body: JSON.stringify(requestData),
                    signal: controller.signal,
                },
                2
            )

            const ctype = response.headers.get("content-type") || ""

            if (!response.ok) {
                const errText = await response.text().catch(() => "")
                throw new Error(
                    `HTTP ${response.status} ${response.statusText}` +
                        (errText ? ` · ${errText.slice(0, 300)}` : "")
                )
            }

            if (ctype.includes("text/event-stream")) {
                const reader = response.body?.getReader()
                if (!reader)
                    throw new Error(
                        "Streaming not supported in this environment."
                    )
                const decoder = new TextDecoder()
                let acc = ""
                let updateScheduled = false

                while (true) {
                    const { value, done } = await reader.read()
                    if (done) break
                    acc += decoder.decode(value, { stream: true })

                    // Batch updates to avoid excessive re-renders
                    if (!updateScheduled) {
                        updateScheduled = true
                        setTimeout(() => {
                            setApiResults(acc)
                            setLoadingProgress((prev) => Math.min(prev + 1.5, 95))
                            updateScheduled = false
                        }, 100) // Update every 100ms max
                    }
                }

                // Final update with complete data
                setApiResults(acc)
                const final = normalizeResult(safeJsonParse(acc.trim()))
                setApiResults(final)
                setLoadingProgress(100)
                setRegenerateRequest("")
                setIsEditMode(false)
                setShowSidePanel(false)
                return
            }

            if (ctype.includes("application/json")) {
                const data = await response.json()
                const final = normalizeResult(data)
                setApiResults(final)
                setLoadingProgress(100)
                setRegenerateRequest("")
                setIsEditMode(false)
                setShowSidePanel(false)
                return
            }

            const text = await response.text()
            const maybeJson = safeJsonParse(text)
            const final = normalizeResult(maybeJson)
            setApiResults(final)
            setLoadingProgress(100)
            setRegenerateRequest("")
            setIsEditMode(false)
            setShowSidePanel(false)
        } catch (error: any) {
            const apiErr = createApiError(error)
            setApiError(apiErr)
            console.error("API error:", error)
        } finally {
            clearTimeout(timer)
            clearInterval(progressInterval)
            setIsLoading(false)
            setRetryCount(0)
        }
    }, [
        regenerateRequest,
        editedScript,
        keyword,
        selectedStyle,
        customStyleName,
        scriptLength,
        selectedTone,
        selectedLanguage,
        ctaInclusion,
        apiResults,
    ])

    const handleChatResponse = useCallback(
        async (response: string, messageId?: string) => {
            if (messageId) {
                setChatMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === messageId
                            ? { ...msg, options: undefined }
                            : msg
                    )
                )
            }

            // Keep last 50 messages to avoid memory issues with long conversations
            setChatMessages((prev) => [
                ...prev.slice(-49),
                {
                    id: generateMessageId(),
                    type: "user",
                    content: response,
                    timestamp: Date.now(),
                },
            ])
            setUserInput("")
            setIsTyping(true)

            const timeoutId = setTimeout(async () => {
                const nextQ = await fetchNextQuestion()

                if (nextQ.question) {
                    const cleanedQuestion = cleanTextForTyping(nextQ.question)
                    typeMessage(cleanedQuestion, () => {
                        setChatMessages((prev) => [
                            ...prev,
                            {
                                id: generateMessageId(),
                                type: "ai",
                                content: cleanedQuestion,
                                options: (nextQ.options || []).filter(opt => opt != null && opt !== ''),
                                timestamp: Date.now(),
                            },
                        ])
                    })
                } else {
                    typeMessage("Great! Generating the final script…", () => {
                        setChatMessages((prev) => [
                            ...prev,
                            {
                                id: generateMessageId(),
                                type: "ai",
                                content: "Great! Generating the final script…",
                                timestamp: Date.now(),
                            },
                        ])
                        setTimeout(() => setCurrentStep(4), TIMINGS.STEP_TRANSITION)
                    })
                }
            }, TIMINGS.CHAT_RESPONSE_DELAY)

            // Return cleanup function
            return () => clearTimeout(timeoutId)
        },
        [fetchNextQuestion, typeMessage, cleanTextForTyping]
    )

    const handleSkipRefinement = useCallback(() => {
        setShowSkipConfirm(true)
    }, [])

    const confirmSkip = useCallback(() => {
        setSkipRefinement(true)
        setShowSkipConfirm(false)
        setCurrentStep(4)
    }, [])

    // [FIX 4] Race Condition 해결 - useRef로 래핑
    const fetchFinalScriptRef = useRef<() => Promise<void>>()

    fetchFinalScriptRef.current = async () => {
        setIsLoading(true)
        setApiError(null)
        setApiResults(null)
        setScoreData(null)
        setLoadingProgress(0)
        setRetryCount(0)
        setEstimatedTime(25)

        const progressInterval = setInterval(() => {
            setLoadingProgress((prev) => Math.min(prev + 1.5, 85))
        }, 500)

        const refinementContext = chatMessages
            .filter((m) => m.type === "user")
            .map((m) => m.content)
            .join(", ")

        const requestData = {
            text: keyword,
            style: selectedStyle === "other" ? customStyleName : selectedStyle,
            length: scriptLength,
            tone: selectedTone,
            language: LANGUAGE_CODE[selectedLanguage] || selectedLanguage,
            ctaInclusion,
            outputType: "script",
            refinementContext: skipRefinement ? null : refinementContext,
            phase: "final",
        }

        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 90000)

        try {
            const response = await fetchWithRetry(
                "https://scripto-api.vercel.app/api/generate-content",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json, text/plain, */*",
                    },
                    cache: "no-store",
                    body: JSON.stringify(requestData),
                    signal: controller.signal,
                },
                2
            )

            const ctype = response.headers.get("content-type") || ""
            if (!response.ok) {
                const errText = await response.text().catch(() => "")
                throw new Error(
                    `HTTP ${response.status} ${response.statusText}${errText ? ` · ${errText.slice(0, 300)}` : ""}`
                )
            }

            if (ctype.includes("text/event-stream")) {
                const reader = response.body?.getReader()
                if (!reader)
                    throw new Error(
                        "Streaming not supported in this environment."
                    )
                const decoder = new TextDecoder()
                let acc = ""
                let updateScheduled = false

                while (true) {
                    const { value, done } = await reader.read()
                    if (done) break
                    acc += decoder.decode(value, { stream: true })

                    // Batch updates to avoid excessive re-renders
                    if (!updateScheduled) {
                        updateScheduled = true
                        setTimeout(() => {
                            setApiResults(acc)
                            setLoadingProgress((prev) => Math.min(prev + 1.5, 95))
                            updateScheduled = false
                        }, 100) // Update every 100ms max
                    }
                }

                // Final update with complete data
                setApiResults(acc)
                const final = normalizeResult(safeJsonParse(acc.trim()))
                setApiResults(final)
                setLoadingProgress(100)
                return
            }

            if (ctype.includes("application/json")) {
                const data = await response.json()
                const final = normalizeResult(data)
                setApiResults(final)
                setLoadingProgress(100)
                return
            }

            const text = await response.text()
            const final = normalizeResult(safeJsonParse(text))
            setApiResults(final)
            setLoadingProgress(100)
        } catch (error: any) {
            const apiErr = createApiError(error)
            setApiError(apiErr)
        } finally {
            clearTimeout(timer)
            clearInterval(progressInterval)
            setIsLoading(false)
            setRetryCount(0)
        }
    }

    // [FIX 4] dependency에서 함수 제거
    useEffect(() => {
        if ((currentStep as number) === 4 && !apiResults && !isLoading) {
            fetchFinalScriptRef.current?.()
        }
    }, [currentStep, apiResults, isLoading])

    useEffect(() => {
        let isMounted = true

        // Only fetch once per step 3.5 entry
        if (currentStep === 3.5 && chatMessages.length === 0 && !isLoading && !hasAttemptedQuestionFetch.current) {
            console.log('[Step 3.5] Starting question fetch...')
            hasAttemptedQuestionFetch.current = true
            setIsLoading(true)

            fetchNextQuestion()
                .then((firstQ) => {
                    console.log('[Step 3.5] Question fetch response:', firstQ)
                    if (!isMounted) return

                    if (firstQ && firstQ.question && firstQ.question.trim()) {
                        const cleanedQuestion = cleanTextForTyping(firstQ.question)
                        typeMessage(cleanedQuestion, () => {
                            if (!isMounted) return

                            setChatMessages([
                                {
                                    id: generateMessageId(),
                                    type: "ai",
                                    content: cleanedQuestion,
                                    options: (firstQ.options || []).filter(opt => opt != null && opt !== ''),
                                    timestamp: Date.now(),
                                },
                            ])
                            if (isMounted) {
                                setIsLoading(false)
                            }
                        })
                    } else {
                        console.warn('[Step 3.5] No valid question received')
                        if (isMounted) {
                            setIsLoading(false)
                            setQuestionFetchFailed(true)
                            setChatMessages([
                                {
                                    id: generateMessageId(),
                                    type: "ai",
                                    content: "Unable to generate refinement questions. You can skip this step.",
                                    options: [],
                                    timestamp: Date.now(),
                                },
                            ])
                        }
                    }
                })
                .catch((error) => {
                    console.error('[Step 3.5] Question fetch error:', error)
                    if (isMounted) {
                        setIsLoading(false)
                        setQuestionFetchFailed(true)
                        setChatMessages([
                            {
                                id: generateMessageId(),
                                type: "ai",
                                content: "Error loading questions. Please skip this step to continue.",
                                options: [],
                                timestamp: Date.now(),
                            },
                        ])
                    }
                })
        }

        return () => {
            isMounted = false
        }
    }, [
        currentStep,
        chatMessages.length,
        isLoading,
        fetchNextQuestion,
        typeMessage,
        cleanTextForTyping,
    ])

    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
        }
    }, [chatMessages, isTyping, typingText])

    useEffect(() => {
        if (currentStep === 3.5 && inputRef.current) {
            inputRef.current.focus()
        }
    }, [currentStep, chatMessages])

    useEffect(() => {
        if (copySuccess) {
            setShowConfetti(true)
            setTimeout(() => {
                setShowConfetti(false)
                setCopySuccess(false)
            }, TIMINGS.CONFETTI_DURATION)
        }
    }, [copySuccess])

    const copyToClipboard = useCallback(async () => {
        if (!apiResults || typeof window === "undefined") return

        try {
            let textToCopy = ""

            if (typeof apiResults === "string") {
                textToCopy = editedScript || apiResults
            } else if (apiResults && typeof apiResults === "object") {
                const parts = []

                if (apiResults.script || editedScript) {
                    parts.push("SCRIPT")
                    parts.push("=" + "=".repeat(50))
                    parts.push(editedScript || apiResults.script)
                    parts.push("")
                }

                if (apiResults.transitions?.length) {
                    parts.push("TRANSITIONS & CUTS")
                    parts.push("=" + "=".repeat(50))
                    apiResults.transitions.forEach((t: any) => {
                        parts.push(`${t.time} - ${t.type}: ${t.description}`)
                    })
                    parts.push("")
                }

                if (apiResults.bRoll?.length) {
                    parts.push("B-ROLL SUGGESTIONS")
                    parts.push("=" + "=".repeat(50))
                    apiResults.bRoll.forEach((b: any) => {
                        parts.push(`${b.timeRange} - ${b.content}`)
                    })
                    parts.push("")
                }

                if (apiResults.textOverlays?.length) {
                    parts.push("TEXT OVERLAYS")
                    parts.push("=" + "=".repeat(50))
                    apiResults.textOverlays.forEach((t: any) => {
                        parts.push(`${t.time} - "${t.text}" (${t.style})`)
                    })
                    parts.push("")
                }

                if (apiResults.soundEffects?.length) {
                    parts.push("SOUND EFFECTS")
                    parts.push("=" + "=".repeat(50))
                    apiResults.soundEffects.forEach((s: any) => {
                        parts.push(`${s.time} - ${s.effect}`)
                    })
                }

                textToCopy = parts.join("\n")
            }

            await navigator.clipboard.writeText(textToCopy)
            setCopySuccess(true)
        } catch (err) {
            console.error("Copy failed:", err)
        }
    }, [apiResults, editedScript])

    const downloadScript = useCallback(() => {
        if (!apiResults) return

        let content = ""
        if (typeof apiResults === "string") {
            content = editedScript || apiResults
        } else {
            try {
                content = JSON.stringify(apiResults, null, 2)
            } catch (e) {
                console.error("JSON serialization error:", e)
                content = String(apiResults)
            }
        }

        const blob = new Blob([content], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `script-${Date.now()}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [apiResults, editedScript])

    const handleNext = () => {
        if (currentStep === 3) {
            setCurrentStep(3.5)
            setQuestionFetchFailed(false)
            hasAttemptedQuestionFetch.current = false
        } else if ((currentStep as number) < 4 && currentStep !== 3.5) {
            startTransition(() => setCurrentStep((currentStep + 1) as Step))
        }
    }

    const handleBack = () => {
        if (currentStep === 3.5) {
            setCurrentStep(3)
            setChatMessages([])
            setSkipRefinement(false)
            setQuestionFetchFailed(false)
            hasAttemptedQuestionFetch.current = false
        } else if ((currentStep as number) > 1) {
            startTransition(() => setCurrentStep((currentStep - 1) as Step))
        }
    }

    // [FIX 10] startTransition 제거
    const handleStyleSelect = (styleId: string) => {
        setSelectedStyle(styleId)
    }

    const canProceed = () => {
        if (currentStep === 1)
            return (
                selectedStyle !== "" &&
                (selectedStyle !== "other" || customStyleName.trim() !== "")
            )
        if (currentStep === 2) return keyword.trim() !== ""
        if (currentStep === 3)
            return selectedTone !== "Select" && selectedLanguage !== "Select"
        if (currentStep === 3.5) return false
        return true
    }

    const ScoreDisplay = ({ scores }: { scores: typeof scoreData }) => {
        if (!scores) return null

        const getScoreColor = (score: number) => {
            if (score >= 80) return primaryColor
            if (score >= 60) return accentColor
            return textColor
        }

        const getScoreGradient = (score: number) => {
            if (score >= 80)
                return `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`
            if (score >= 60)
                return `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`
            return `linear-gradient(135deg, ${textColor}60 0%, ${textColor}80 100%)`
        }

        const getScoreLabel = (score: number) => {
            if (score >= 90) return "Excellent"
            if (score >= 80) return "Great"
            if (score >= 70) return "Good"
            if (score >= 60) return "Fair"
            return "Needs Work"
        }

        return (
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{
                    padding: "1.125rem",
                    background: `linear-gradient(135deg, ${cardColor} 0%, ${backgroundColor} 100%)`,
                    borderRadius: "1rem",
                    border: `1px solid ${accentColor}`,
                    marginBottom: "1rem",
                    position: "relative",
                    overflow: "hidden",
                }}
            >
                <motion.div
                    onClick={() => setScoreExpanded(!scoreExpanded)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        marginBottom: scoreExpanded ? "1rem" : "0",
                        transition: "margin 0.3s ease",
                    }}
                    whileHover={{ scale: 1.01 }}
                    role="button"
                    aria-label={`Score ${scoreExpanded ? "Collapse" : "Expand"}`}
                    aria-expanded={scoreExpanded}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                        }}
                    >
                        <div
                            style={{
                                width: "2.625rem",
                                height: "2.625rem",
                                borderRadius: "50%",
                                background: getScoreGradient(scores.overall),
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                ...headingFont,
                                fontSize: "1.125rem",
                                fontWeight: "bold",
                                color: "#ffffff",
                            }}
                        >
                            {scores.overall}
                        </div>
                        <div>
                            <div
                                style={{
                                    ...bodyFont,
                                    fontSize: "0.8125rem",
                                    color: textColor,
                                    opacity: 0.85,
                                }}
                            >
                                Quality Score
                            </div>
                            <div
                                style={{
                                    ...headingFont,
                                    fontSize: "1.0625rem",
                                    color: textColor,
                                    fontWeight: 700,
                                }}
                            >
                                {getScoreLabel(scores.overall)}
                            </div>
                        </div>
                    </div>
                    <motion.div
                        animate={{ rotate: scoreExpanded ? 180 : 0 }}
                        transition={{ duration: 0.3 }}
                        style={{
                            width: "1.75rem",
                            height: "1.75rem",
                            borderRadius: "50%",
                            backgroundColor: `${textColor}10`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                        aria-hidden="true"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={textColor}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </motion.div>
                </motion.div>

                <AnimatePresence>
                    {scoreExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{ overflow: "hidden" }}
                        >
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(2, 1fr)",
                                    gap: "0.75rem",
                                }}
                            >
                                {[
                                    {
                                        label: "Creativity",
                                        value: scores.creativity,
                                        desc: "Word diversity",
                                    },
                                    {
                                        label: "Engagement",
                                        value: scores.engagement,
                                        desc: "Hook strength",
                                    },
                                    {
                                        label: "Clarity",
                                        value: scores.clarity,
                                        desc: "Readability",
                                    },
                                    {
                                        label: "Timing",
                                        value: scores.timing,
                                        desc: "Length match",
                                    },
                                ].map((item, index) => (
                                    <motion.div
                                        key={item.label}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{
                                            duration: 0.3,
                                            delay: index * 0.05,
                                        }}
                                        style={{
                                            padding: "0.625rem",
                                            backgroundColor: backgroundColor,
                                            borderRadius: "0.5rem",
                                            border: `1px solid ${accentColor}`,
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                marginBottom: "0.375rem",
                                            }}
                                        >
                                            <div>
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        fontSize: "0.75rem",
                                                        color: textColor,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {item.label}
                                                </div>
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        fontSize: "0.625rem",
                                                        color: textColor,
                                                        opacity: 0.5,
                                                    }}
                                                >
                                                    {item.desc}
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    ...bodyFont,
                                                    fontSize: "0.9375rem",
                                                    fontWeight: "bold",
                                                    color: getScoreColor(
                                                        item.value
                                                    ),
                                                }}
                                            >
                                                {item.value}
                                            </div>
                                        </div>
                                        <div
                                            style={{
                                                height: "3px",
                                                backgroundColor: accentColor,
                                                borderRadius: "1.5px",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{
                                                    width: `${item.value}%`,
                                                }}
                                                transition={{
                                                    duration: 0.8,
                                                    delay: 0.2 + index * 0.1,
                                                }}
                                                style={{
                                                    height: "100%",
                                                    background:
                                                        getScoreGradient(
                                                            item.value
                                                        ),
                                                }}
                                            />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        )
    }

    const EnhancedScriptDisplay = ({
        script,
        transitions,
        bRoll,
        textColor,
        primaryColor,
        backgroundColor,
        bodyFont,
        hoveredPopup,
        setHoveredPopup,
    }: any) => {
        const [hoverTimeout, setHoverTimeout] = useState<number | null>(null)
        const [hoveredLine, setHoveredLine] = useState<number | null>(null)
        const containerRef = useRef<HTMLDivElement>(null)

        useEffect(() => {
            return () => {
                if (hoverTimeout) {
                    clearTimeout(hoverTimeout)
                }
            }
        }, [hoverTimeout])

        const parseScriptLine = (line: string) => {
            // Support multiple timestamp formats:
            // [0.0-5.0], [0:00-0:05], (0.0-5.0)
            const formats = [
                /^\[(\d+\.?\d*)-(\d+\.?\d*)\]/,  // [0.0-5.0]
                /^\[(\d+):(\d+)-(\d+):(\d+)\]/,  // [0:00-1:30]
                /^\((\d+\.?\d*)-(\d+\.?\d*)\)/,  // (0.0-5.0)
            ]

            for (const regex of formats) {
                const match = line.match(regex)
                if (match) {
                    let start, end, timestamp
                    if (match.length === 3) {
                        // Simple decimal format
                        start = parseFloat(match[1])
                        end = parseFloat(match[2])
                        timestamp = match[0]
                    } else if (match.length === 5) {
                        // MM:SS format
                        start = parseInt(match[1]) * 60 + parseInt(match[2])
                        end = parseInt(match[3]) * 60 + parseInt(match[4])
                        timestamp = match[0]
                    }
                    return {
                        start,
                        end,
                        timestamp,
                        text: line.substring(timestamp.length).trim(),
                    }
                }
            }
            return null
        }

        const findAnnotations = (start: number, end: number) => {
            const annotations: any[] = []

            const transition = transitions.find((t: any) => {
                const transitionTime = parseFloat(t.time.replace("s", ""))
                return Math.abs(transitionTime - start) < 0.1
            })
            if (transition) {
                annotations.push({ type: "transition", data: transition })
            }

            const bRollItem = bRoll.find((b: any) => {
                const [bStart, bEnd] = b.timeRange
                    .replace("s", "")
                    .split("-")
                    .map((t: string) => parseFloat(t))
                return start >= bStart && start <= bEnd
            })
            if (bRollItem) {
                annotations.push({ type: "broll", data: bRollItem })
            }

            return annotations
        }

        const handleMouseEnter = (
            e: React.MouseEvent,
            type: string,
            content: any
        ) => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout)
                setHoverTimeout(null)
            }

            const rect = e.currentTarget.getBoundingClientRect()
            const container = containerRef.current
            const containerRect = container?.getBoundingClientRect()

            if (containerRect) {
                let x = rect.left + rect.width / 2 - containerRect.left
                let y = rect.top - containerRect.top - 10

                // Boundary 체크 (화면 밖으로 나가지 않도록)
                const popupWidth = 300
                const popupHeight = 100

                if (x - popupWidth / 2 < 0) {
                    x = popupWidth / 2 + 10
                }
                if (x + popupWidth / 2 > containerRect.width) {
                    x = containerRect.width - popupWidth / 2 - 10
                }
                if (y - popupHeight < 0) {
                    y = rect.bottom - containerRect.top + 10
                }

                setHoveredPopup({
                    type: type as "transition" | "broll",
                    content,
                    x,
                    y,
                })
            }
        }

        const handleMouseLeave = () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout)
            }

            const timeout = window.setTimeout(() => {
                setHoveredPopup(null)
            }, 200)
            setHoverTimeout(timeout)
        }

        const handlePopupMouseEnter = () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout)
                setHoverTimeout(null)
            }
        }

        const handlePopupMouseLeave = () => {
            setHoveredPopup(null)
        }

        const renderAnnotationIcon = (
            type: string,
            content: any,
            index: number
        ) => {
            const iconStyle = {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1.25rem",
                height: "1.25rem",
                borderRadius: "50%",
                marginLeft: "0.375rem",
                marginRight: "0.375rem",
                cursor: "pointer",
                fontSize: "0.6875rem",
                fontWeight: "bold" as const,
                transition: "all 0.2s ease",
                transform: "scale(1)",
                zIndex: Z_INDEX.TOOLTIP,
            }

            if (type === "transition") {
                return (
                    <motion.span
                        key={`transition-${index}`}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            ...iconStyle,
                            backgroundColor: "#3b82f6",
                            color: "white",
                            border: "2px solid #1e40af",
                        }}
                        onMouseEnter={(e) => {
                            handleMouseEnter(e, type, content)
                        }}
                        onMouseLeave={() => {
                            handleMouseLeave()
                        }}
                        title="Transition"
                        role="button"
                        aria-label="View transition details"
                    >
                        T
                    </motion.span>
                )
            } else if (type === "broll") {
                return (
                    <motion.span
                        key={`broll-${index}`}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            ...iconStyle,
                            backgroundColor: "#10b981",
                            color: "white",
                            border: "2px solid #047857",
                        }}
                        onMouseEnter={(e) => {
                            handleMouseEnter(e, type, content)
                        }}
                        onMouseLeave={() => {
                            handleMouseLeave()
                        }}
                        title="B-Roll"
                        role="button"
                        aria-label="View B-Roll details"
                    >
                        B
                    </motion.span>
                )
            }
            return null
        }

        const scriptLines = script
            .split("\n")
            .filter((line: string) => line.trim())

        return (
            <div
                ref={containerRef}
                className="script-container"
                style={{ position: "relative" }}
            >
                {scriptLines.map((line: string, lineIndex: number) => {
                    const parsed = parseScriptLine(line)
                    if (!parsed)
                        return (
                            <div
                                key={lineIndex}
                                style={{
                                    marginBottom: "0.75rem",
                                    ...WORD_BREAK_STYLE,
                                }}
                            >
                                {line}
                            </div>
                        )

                    const annotations = findAnnotations(
                        parsed.start,
                        parsed.end
                    )

                    return (
                        <motion.div
                            key={lineIndex}
                            onMouseEnter={() => setHoveredLine(lineIndex)}
                            onMouseLeave={() => setHoveredLine(null)}
                            whileHover={{ x: 3 }}
                            style={{
                                marginBottom: "0.875rem",
                                display: "flex",
                                alignItems: "flex-start",
                                lineHeight: "1.7",
                                padding: "0.5rem",
                                borderRadius: "0.375rem",
                                backgroundColor:
                                    hoveredLine === lineIndex
                                        ? `${primaryColor}08`
                                        : "transparent",
                                transition: "all 0.2s ease",
                                borderLeft:
                                    hoveredLine === lineIndex
                                        ? `3px solid ${primaryColor}`
                                        : "3px solid transparent",
                            }}
                        >
                            <span
                                style={{
                                    color: primaryColor,
                                    fontWeight: "bold",
                                    marginRight: "0.625rem",
                                    minWidth: "fit-content",
                                    fontSize: "0.8125rem",
                                }}
                            >
                                {parsed.timestamp}
                            </span>

                            {annotations.length > 0 && (
                                <span
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        marginRight: "0.625rem",
                                    }}
                                >
                                    {annotations.map((annotation, annIndex) =>
                                        renderAnnotationIcon(
                                            annotation.type,
                                            annotation.data,
                                            annIndex
                                        )
                                    )}
                                </span>
                            )}

                            <span
                                style={{
                                    flex: 1,
                                    whiteSpace: "pre-wrap",
                                    ...WORD_BREAK_STYLE,
                                }}
                            >
                                {parsed.text}
                            </span>
                        </motion.div>
                    )
                })}

                <AnimatePresence>
                    {hoveredPopup && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            transition={{ duration: 0.15 }}
                            style={{
                                position: "absolute",
                                left: hoveredPopup.x,
                                top: hoveredPopup.y,
                                transform: "translateX(-50%) translateY(-100%)",
                                backgroundColor: backgroundColor,
                                border: `2px solid ${primaryColor}`,
                                borderRadius: "0.75rem",
                                padding: "1rem",
                                maxWidth: "18.75rem",
                                zIndex: Z_INDEX.TOOLTIP,
                                boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                                pointerEvents: "auto",
                                ...bodyFont,
                                fontSize: "0.8125rem",
                                color: textColor,
                            }}
                            onMouseEnter={handlePopupMouseEnter}
                            onMouseLeave={handlePopupMouseLeave}
                            role="tooltip"
                        >
                            <div
                                style={{
                                    position: "absolute",
                                    bottom: "-8px",
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    width: "0",
                                    height: "0",
                                    borderLeft: "8px solid transparent",
                                    borderRight: "8px solid transparent",
                                    borderTop: `8px solid ${primaryColor}`,
                                }}
                            />

                            {hoveredPopup.type === "transition" && (
                                <div>
                                    <div
                                        style={{
                                            color: "#3b82f6",
                                            fontWeight: "bold",
                                            marginBottom: "0.5rem",
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        Transition - {hoveredPopup.content.time}
                                    </div>
                                    <div
                                        style={{
                                            fontWeight: "bold",
                                            marginBottom: "0.25rem",
                                            fontSize: "0.8125rem",
                                        }}
                                    >
                                        {hoveredPopup.content.type}
                                    </div>
                                    <div
                                        style={{
                                            opacity: 0.9,
                                            lineHeight: "1.4",
                                        }}
                                    >
                                        {hoveredPopup.content.description}
                                    </div>
                                </div>
                            )}
                            {hoveredPopup.type === "broll" && (
                                <div>
                                    <div
                                        style={{
                                            color: "#10b981",
                                            fontWeight: "bold",
                                            marginBottom: "0.5rem",
                                            fontSize: "0.875rem",
                                        }}
                                    >
                                        B-Roll -{" "}
                                        {hoveredPopup.content.timeRange}
                                    </div>
                                    <div
                                        style={{
                                            opacity: 0.9,
                                            lineHeight: "1.4",
                                        }}
                                    >
                                        {hoveredPopup.content.content}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        )
    }

    const renderResults = () => {
        if (showSidePanel) {
            const currentScript =
                typeof apiResults === "string"
                    ? apiResults
                    : apiResults?.script || ""

            return (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                        display: "flex",
                        flexDirection: windowWidth < 768 ? "column" : "row",
                        gap: "1rem",
                        height: "100%",
                    }}
                >
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                ...bodyFont,
                                fontSize: "0.8125rem",
                                color: textColor,
                                opacity: 0.7,
                                fontWeight: 600,
                            }}
                        >
                            📄 Original Script
                        </div>
                        <div
                            style={{
                                flex: 1,
                                padding: "1rem",
                                backgroundColor: `${textColor}05`,
                                borderRadius: "0.75rem",
                                border: `1.5px solid ${accentColor}`,
                                overflow: "auto",
                                ...bodyFont,
                                fontSize: "0.875rem",
                                color: textColor,
                                lineHeight: 1.7,
                                whiteSpace: "pre-wrap",
                                ...WORD_BREAK_STYLE,
                            }}
                        >
                            {currentScript}
                        </div>
                    </div>

                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.75rem",
                            minWidth: 0,
                        }}
                    >
                        <div
                            style={{
                                ...bodyFont,
                                fontSize: "0.8125rem",
                                color: primaryColor,
                                fontWeight: 600,
                            }}
                        >
                            ✏️ Your Edits
                        </div>
                        <textarea
                            value={editedScript || currentScript}
                            onChange={(e) => setEditedScript(e.target.value)}
                            style={{
                                flex: 1,
                                padding: "1rem",
                                backgroundColor: backgroundColor,
                                border: `1.5px solid ${primaryColor}`,
                                borderRadius: "0.75rem",
                                color: textColor,
                                ...bodyFont,
                                fontSize: "0.875rem",
                                lineHeight: 1.7,
                                resize: "none",
                                outline: `2px solid ${primaryColor}`,
                                outlineOffset: "2px",
                                ...WORD_BREAK_STYLE,
                            }}
                            placeholder="Edit your script..."
                            aria-label="Edit script"
                        />

                        <div
                            style={{
                                padding: "0.875rem",
                                background: `linear-gradient(135deg, ${cardColor} 0%, ${backgroundColor} 100%)`,
                                borderRadius: "0.75rem",
                                border: `1.5px solid ${accentColor}`,
                            }}
                        >
                            <div
                                style={{
                                    ...bodyFont,
                                    fontSize: "0.75rem",
                                    color: textColor,
                                    marginBottom: "0.5rem",
                                    fontWeight: 600,
                                }}
                            >
                                🤖 AI Enhancement
                            </div>
                            <input
                                type="text"
                                value={regenerateRequest}
                                onChange={(e) =>
                                    setRegenerateRequest(e.target.value)
                                }
                                onKeyDown={(e) => {
                                    if (
                                        e.key === "Enter" &&
                                        regenerateRequest.trim()
                                    ) {
                                        regenerateWithEdit()
                                    }
                                }}
                                placeholder="e.g., make it funnier, add a CTA…"
                                style={{
                                    width: "100%",
                                    padding: "0.625rem 0.875rem",
                                    backgroundColor: backgroundColor,
                                    border: `1.5px solid ${regenerateRequest ? primaryColor : accentColor}`,
                                    borderRadius: "0.625rem",
                                    color: textColor,
                                    ...bodyFont,
                                    fontSize: "0.8125rem",
                                    outline: `2px solid ${primaryColor}`,
                                    outlineOffset: "2px",
                                    ...WORD_BREAK_STYLE,
                                }}
                                aria-label="AI enhancement request"
                            />
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: "0.625rem",
                            }}
                        >
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    setShowSidePanel(false)
                                    setIsEditMode(false)
                                    setEditedScript("")
                                    setRegenerateRequest("")
                                }}
                                style={{
                                    flex: 1,
                                    padding: "0.6875rem",
                                    ...BUTTON_STYLES.base,
                                    ...BUTTON_STYLES.secondary(
                                        cardColor,
                                        textColor
                                    ),
                                    borderRadius: "0.625rem",
                                    ...bodyFont,
                                    fontSize: "0.8125rem",
                                    fontWeight: 600,
                                }}
                                aria-label="Cancel editing"
                            >
                                Cancel
                            </motion.button>
                            <motion.button
                                whileHover={{
                                    scale: regenerateRequest.trim() ? 1.02 : 1,
                                }}
                                whileTap={{
                                    scale: regenerateRequest.trim() ? 0.98 : 1,
                                }}
                                onClick={regenerateWithEdit}
                                disabled={!regenerateRequest.trim()}
                                style={{
                                    flex: 2,
                                    padding: "0.6875rem",
                                    ...BUTTON_STYLES.base,
                                    ...(regenerateRequest.trim()
                                        ? BUTTON_STYLES.primary(
                                              primaryColor,
                                              textOnPrimary
                                          )
                                        : {
                                              backgroundColor: cardColor,
                                              border: `1.5px solid ${textColor}25`,
                                              color: `${textColor}50`,
                                              cursor: "not-allowed",
                                          }),
                                    borderRadius: "0.625rem",
                                    ...bodyFont,
                                    fontSize: "0.8125rem",
                                    fontWeight: 700,
                                    boxShadow: regenerateRequest.trim()
                                        ? `0 4px 16px ${primaryColor}40`
                                        : "none",
                                }}
                                aria-label="Regenerate with AI"
                            >
                                Regenerate with AI
                            </motion.button>
                        </div>
                    </div>
                </motion.div>
            )
        }

        if (typeof apiResults === "string") {
            return (
                <div
                    style={{
                        whiteSpace: "pre-wrap",
                        ...bodyFont,
                        color: textColor,
                        lineHeight: 1.7,
                        fontSize: "0.9375rem",
                        opacity: 0.95,
                        ...WORD_BREAK_STYLE,
                    }}
                >
                    {apiResults}
                </div>
            )
        } else if (apiResults && typeof apiResults === "object") {
            return (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1.125rem",
                    }}
                >
                    <div>
                        <div
                            style={{
                                ...bodyFont,
                                color: primaryColor,
                                fontWeight: 700,
                                marginBottom: "0.625rem",
                                fontSize: "1.0625rem",
                            }}
                        >
                            Script
                        </div>
                        <div
                            style={{
                                padding: "1rem",
                                backgroundColor: accentColor,
                                borderRadius: "0.625rem",
                                ...bodyFont,
                                color: textColor,
                                fontSize: "0.875rem",
                                lineHeight: 1.6,
                                position: "relative",
                            }}
                        >
                            <EnhancedScriptDisplay
                                script={apiResults.script}
                                transitions={apiResults.transitions || []}
                                bRoll={apiResults.bRoll || []}
                                textColor={textColor}
                                primaryColor={primaryColor}
                                backgroundColor={backgroundColor}
                                bodyFont={bodyFont}
                                hoveredPopup={hoveredPopup}
                                setHoveredPopup={setHoveredPopup}
                            />
                        </div>
                    </div>

                    {apiResults.textOverlays &&
                        apiResults.textOverlays.length > 0 && (
                            <div>
                                <div
                                    style={{
                                        ...bodyFont,
                                        color: primaryColor,
                                        fontWeight: 700,
                                        marginBottom: "0.625rem",
                                        fontSize: "1.0625rem",
                                    }}
                                >
                                    Text Overlays
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "0.5rem",
                                    }}
                                >
                                    {apiResults.textOverlays.map(
                                        (overlay: any, i: number) => (
                                            <div
                                                key={i}
                                                style={{
                                                    padding:
                                                        "0.625rem 0.875rem",
                                                    backgroundColor:
                                                        accentColor,
                                                    borderRadius: "0.5rem",
                                                    ...bodyFont,
                                                    color: textColor,
                                                    fontSize: "0.8125rem",
                                                    ...WORD_BREAK_STYLE,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        color: primaryColor,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {overlay.time}
                                                </span>{" "}
                                                - "{overlay.text}" (
                                                {overlay.style})
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        )}

                    {apiResults.soundEffects &&
                        apiResults.soundEffects.length > 0 && (
                            <div>
                                <div
                                    style={{
                                        ...bodyFont,
                                        color: primaryColor,
                                        fontWeight: 700,
                                        marginBottom: "0.625rem",
                                        fontSize: "1.0625rem",
                                    }}
                                >
                                    Sound Effects
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "0.5rem",
                                    }}
                                >
                                    {apiResults.soundEffects.map(
                                        (sound: any, i: number) => (
                                            <div
                                                key={i}
                                                style={{
                                                    padding:
                                                        "0.625rem 0.875rem",
                                                    backgroundColor:
                                                        accentColor,
                                                    borderRadius: "0.5rem",
                                                    ...bodyFont,
                                                    color: textColor,
                                                    fontSize: "0.8125rem",
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        color: primaryColor,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {sound.time}
                                                </span>{" "}
                                                - {sound.effect}
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        )}
                </div>
            )
        }
        return null
    }

    // [FIX 6] handleKeyDown 최적화 - useRef로 state 접근하여 재등록 방지
    useEffect(() => {
        if (isStatic || typeof window === "undefined") return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (showSkipConfirm) return

            const activeElement = document.activeElement as HTMLElement | null
            const isInputFocused =
                !!activeElement &&
                ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName)

            if (e.key === "Escape") {
                if (isEditMode || showSidePanel) {
                    setIsEditMode(false)
                    setShowSidePanel(false)
                    setEditedScript("")
                    setRegenerateRequest("")
                } else if (showSkipConfirm) {
                    setShowSkipConfirm(false)
                } else if (showMoreActions) {
                    setShowMoreActions(false)
                }
                return
            }

            if (!isExpanded && e.key === "Enter") {
                e.preventDefault()
                setIsExpanded(true)
                return
            }

            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                if (canProceed() && (currentStep as number) < 4) {
                    e.preventDefault()
                    handleNext()
                }
                return
            }

            if (
                e.key === "Enter" &&
                !e.shiftKey &&
                currentStep === 3.5 &&
                userInput.trim() &&
                isInputFocused
            ) {
                e.preventDefault()
                handleChatResponse(userInput.trim())
                return
            }

            if (e.key === "Enter" && !isInputFocused) {
                if (currentStep === 1 && canProceed()) {
                    e.preventDefault()
                    handleNext()
                } else if (
                    (currentStep as number) > 1 &&
                    canProceed() &&
                    (currentStep as number) < 4
                ) {
                    e.preventDefault()
                    handleNext()
                }
            }

            if (
                e.key === "Tab" &&
                e.shiftKey &&
                (currentStep as number) > 1 &&
                !isInputFocused
            ) {
                e.preventDefault()
                handleBack()
            }

            if (
                (e.ctrlKey || e.metaKey) &&
                e.key === "c" &&
                apiResults &&
                (currentStep as number) === 4 &&
                !isInputFocused
            ) {
                e.preventDefault()
                copyToClipboard()
            }
        }

        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
        // Note: Intentionally using all dependencies to keep handler updated
        // This is necessary for keyboard shortcuts to work correctly with current state
    }, [
        showSkipConfirm,
        isExpanded,
        currentStep,
        isEditMode,
        showSidePanel,
        showMoreActions,
        userInput,
        apiResults,
        isStatic,
    ])

    const handleExpand = () => startTransition(() => setIsExpanded(true))

    const handleCollapse = () => {
        if (hasUnsavedChanges || (currentStep as number) > 1) {
            setModalConfig({
                show: true,
                title: "Unsaved Work",
                message: "You have unsaved work. Close anyway?",
                type: "confirm",
                onConfirm: () => {
                    setModalConfig(prev => ({ ...prev, show: false }))
                    startTransition(() => {
                        setIsExpanded(false)
                        setCurrentStep(1)
                        setSelectedStyle("")
                        setCustomStyleName("")
                        setBroadTopic("")
                        setKeyword("")
                        setApiResults(null)
                        setEditedScript("")
                        setRegenerateRequest("")
                        setChatMessages([])
                        setUserInput("")
                        setHasUnsavedChanges(false)
                        try {
                            sessionStorage.removeItem("ideaGenerator_state")
                        } catch (e) {
                            console.warn("Failed to clear session storage:", e)
                        }
                    })
                },
                onCancel: () => setModalConfig(prev => ({ ...prev, show: false })),
            })
            return
        }

        startTransition(() => {
            setIsExpanded(false)
            setCurrentStep(1)
            setSelectedStyle("")
            setCustomStyleName("")
            setBroadTopic("")
            setKeyword("")
            setScriptLength(45)
            setSelectedLanguage("Select")
            setSelectedTone("Select")
            setCtaInclusion(false)
            setApiResults(null)
            setIsLoading(false)
            setApiError(null)
            setCopySuccess(false)
            setHoveredPopup(null)
            setScoreData(null)
            setIsEditMode(false)
            setShowSidePanel(false)
            setEditedScript("")
            setRegenerateRequest("")
            setChatMessages([])
            setSkipRefinement(false)
            setHasUnsavedChanges(false)
            setLoadingProgress(0)
            setRetryCount(0)
            setShowConfetti(false)

            try {
                sessionStorage.removeItem("ideaGenerator_state")
            } catch (e) {
                console.warn("Failed to clear state:", e)
            }
        })
    }

    if (isStatic) {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor,
                    padding: "1.25rem",
                    borderRadius: "0.875rem",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                    position: "relative",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    visibility: preview ? "visible" : "hidden",
                }}
            >
                <div style={{ marginBottom: "1.25rem" }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "0.5rem",
                        }}
                    >
                        {[1, 2, 3, 4].map((step) => (
                            <div
                                key={step}
                                style={{
                                    width: "25%",
                                    height: "5px",
                                    backgroundColor:
                                        step === 1 ? primaryColor : "#E5E5E5",
                                    borderRadius: "2.5px",
                                }}
                            />
                        ))}
                    </div>
                    <div
                        style={{
                            ...bodyFont,
                            color: textColor,
                            opacity: 0.7,
                            fontSize: "1rem",
                        }}
                    >
                        Step 1 of 4
                    </div>
                </div>

                <div style={{ flex: 1, overflow: "auto" }}>
                    <div
                        style={{
                            ...headingFont,
                            color: textColor,
                            marginBottom: "0.75rem",
                            fontSize: "1.625rem",
                        }}
                    >
                        Choose Your Video Style
                    </div>
                    <div
                        style={{
                            ...bodyFont,
                            color: textColor,
                            opacity: 0.7,
                            marginBottom: "1rem",
                            fontSize: "1rem",
                        }}
                    >
                        Select the type of video content
                    </div>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(12.5rem, 1fr))",
                            gap: "0.75rem",
                        }}
                    >
                        {videoStyles.slice(0, 6).map((style, i) => (
                            <div
                                key={style.id}
                                style={{
                                    padding: "1rem",
                                    backgroundColor:
                                        i === 0 ? accentColor : cardColor,
                                    border:
                                        i === 0
                                            ? `2px solid ${primaryColor}`
                                            : "2px solid transparent",
                                    borderRadius: "0.625rem",
                                }}
                            >
                                <div
                                    style={{
                                        ...headingFont,
                                        fontSize: "1.0625rem",
                                        color: textColor,
                                        marginBottom: "0.375rem",
                                    }}
                                >
                                    {style.title}
                                </div>
                                <div
                                    style={{
                                        ...bodyFont,
                                        fontSize: "0.9375rem",
                                        color: textColor,
                                        opacity: 0.7,
                                    }}
                                >
                                    {style.description}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "1.25rem",
                        paddingTop: "1rem",
                        borderTop: `1px solid ${accentColor}`,
                    }}
                >
                    <button
                        style={{
                            padding: "0.75rem 1.25rem",
                            ...BUTTON_STYLES.base,
                            ...BUTTON_STYLES.disabled(textColor),
                            borderRadius: "0.625rem",
                            ...buttonFont,
                            fontSize: "0.9375rem",
                        }}
                        disabled
                        aria-label="Previous step"
                    >
                        Back
                    </button>
                    <button
                        style={{
                            padding: "0.75rem 1.25rem",
                            ...BUTTON_STYLES.base,
                            ...BUTTON_STYLES.primary(
                                primaryColor,
                                getReadableTextOn(primaryColor)
                            ),
                            borderRadius: "0.625rem",
                            ...buttonFont,
                            fontSize: "0.9375rem",
                            opacity: canProceed() ? 1 : 0.6,
                        }}
                        aria-label="Next step"
                    >
                        Next
                    </button>
                </div>
            </div>
        )
    }

    const pageVariants = {
        initial: { opacity: 0, scale: 0.98 },
        in: { opacity: 1, scale: 1 },
        out: { opacity: 0, scale: 0.98 },
    }
    const pageTransition = { duration: 0.3, ease: "easeInOut" }

    return (
        <div
            style={{
                width: isExpanded ? "100%" : "min(38.125rem, 100%)",
                height: isExpanded ? "100%" : "4rem",
                backgroundColor: isExpanded ? backgroundColor : cardColor,
                borderRadius: "0.875rem",
                boxShadow: isExpanded
                    ? "0 8px 32px rgba(0,0,0,0.15)"
                    : "0 4px 20px rgba(0,0,0,0.08)",
                position: "relative",
                overflow: "hidden",
                display: "flex",
                alignItems: isExpanded ? "stretch" : "center",
                justifyContent: "center",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
        >
            {showConfetti && typeof window !== "undefined" && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                        zIndex: Z_INDEX.CONFETTI,
                    }}
                    role="presentation"
                    aria-hidden="true"
                >
                    {[...Array(30)].map((_, i) => (
                        <motion.div
                            key={i}
                            initial={{
                                x: Math.random() * windowWidth,
                                y: -20,
                                rotate: 0,
                            }}
                            animate={{
                                y: (typeof window !== "undefined" ? window.innerHeight : 800) + 20,
                                rotate: 360 * (Math.random() > 0.5 ? 1 : -1),
                                x: Math.random() * windowWidth,
                            }}
                            transition={{
                                duration: 2 + Math.random() * 2,
                                ease: "easeOut",
                            }}
                            style={{
                                position: "absolute",
                                width: "0.5rem",
                                height: "0.5rem",
                                backgroundColor: [
                                    primaryColor,
                                    "#10b981",
                                    "#f59e0b",
                                    "#ef4444",
                                    "#3b82f6",
                                ][i % 5],
                                borderRadius: Math.random() > 0.5 ? "50%" : "0",
                            }}
                        />
                    ))}
                </div>
            )}

            <AnimatePresence>
                {!isExpanded ? (
                    <motion.div
                        key="step0"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.75rem",
                            width: "100%",
                            justifyContent: "center",
                        }}
                    >
                        <input
                            type="text"
                            value={broadTopic}
                            onChange={(e) => setBroadTopic(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleExpand()
                            }}
                            placeholder="e.g., fitness, cooking, tech…"
                            style={{
                                width: "100%",
                                maxWidth: "34.375rem",
                                height: "2.625rem",
                                padding: "0 1.125rem",
                                backgroundColor: cardColor,
                                border: `1.5px solid ${accentColor}`,
                                borderRadius: "0.75rem",
                                color: textColor,
                                ...bodyFont,
                                fontSize: "1rem",
                                outline: `2px solid ${primaryColor}`,
                                outlineOffset: "2px",
                                transition: "all 0.2s ease",
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = primaryColor
                                e.target.style.boxShadow =
                                    `0 0 0 3px ${primaryColor}25`
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = accentColor
                                e.target.style.boxShadow = "none"
                            }}
                            aria-label="Enter topic"
                        />
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleExpand}
                            style={{
                                width: "2.625rem",
                                height: "2.625rem",
                                borderRadius: "50%",
                                backgroundColor: "#ffffff",
                                border: "none",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.2s ease",
                                flexShrink: 0,
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                    "#e5e5e5"
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                    "#ffffff"
                            }}
                            aria-label="Get started"
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#27272a"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 19V5M5 12l7-7 7 7" />
                            </svg>
                        </motion.button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="generator"
                        initial={{ scale: 0.98, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.98, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        style={{
                            width: "100%",
                            height: "100%",
                            padding: "1.25rem",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                        }}
                    >
                        <motion.button
                            whileHover={{ scale: 1.06 }}
                            whileTap={{ scale: 0.94 }}
                            onClick={handleCollapse}
                            style={{
                                position: "absolute",
                                top: "0.75rem",
                                right: "0.75rem",
                                width: "1.875rem",
                                height: "1.875rem",
                                borderRadius: "50%",
                                backgroundColor: cardColor,
                                border: `1.5px solid ${accentColor}`,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: Z_INDEX.CLOSE_BUTTON,
                                transition: "all 0.2s ease",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = `${textColor}15`
                                e.currentTarget.style.transform = "scale(1.05)"
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                    cardColor
                                e.currentTarget.style.transform = "scale(1)"
                            }}
                            aria-label="Close generator"
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={textColor}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </motion.button>

                        <div
                            style={{ marginBottom: "1.125rem", flexShrink: 0 }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "0.625rem",
                                }}
                            >
                                {[1, 2, 3, 4].map((step) => (
                                    <div
                                        key={step}
                                        style={{
                                            width: "24.5%",
                                            height: "5px",
                                            backgroundColor:
                                                step <= currentStep
                                                    ? primaryColor
                                                    : "#E5E5E5",
                                            borderRadius: "2.5px",
                                            transition: "all 0.25s ease",
                                            boxShadow:
                                                step === currentStep
                                                    ? `0 0 8px ${primaryColor}45`
                                                    : "none",
                                            transform:
                                                step === currentStep
                                                    ? "scaleY(1.2)"
                                                    : "scaleY(1)",
                                        }}
                                        role="progressbar"
                                        aria-label={`Step ${step}`}
                                        aria-valuenow={step}
                                        aria-valuemax={4}
                                    />
                                ))}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "0.625rem",
                                }}
                            >
                                {[
                                    { step: 1, label: "Style" },
                                    { step: 2, label: "Topic" },
                                    { step: 3, label: "Settings" },
                                    { step: 4, label: "Results" },
                                ].map(({ step, label }) => (
                                    <div
                                        key={step}
                                        style={{
                                            width: "25%",
                                            textAlign: "center",
                                            ...bodyFont,
                                            fontSize:
                                                step === currentStep
                                                    ? "0.9375rem"
                                                    : "0.875rem",
                                            color:
                                                step === currentStep
                                                    ? primaryColor
                                                    : step < currentStep
                                                      ? textColor
                                                      : "#999",
                                            fontWeight:
                                                step === currentStep
                                                    ? "700"
                                                    : step < currentStep
                                                      ? "600"
                                                      : "400",
                                            transition: "all 0.2s ease",
                                        }}
                                    >
                                        {label}
                                    </div>
                                ))}
                            </div>
                            <div
                                style={{
                                    ...bodyFont,
                                    color: primaryColor,
                                    opacity: 0.9,
                                    fontSize: "1rem",
                                    fontWeight: 700,
                                    textAlign: "center",
                                }}
                            >
                                Step {currentStep === 3.5 ? "3.5" : currentStep} of 4
                            </div>
                        </div>

                        <div
                            style={{
                                flex: 1,
                                position: "relative",
                                overflow: "hidden",
                                minHeight: 0,
                            }}
                        >
                            <AnimatePresence>
                                {currentStep === 1 && (
                                    <motion.div
                                        key="step1"
                                        initial="initial"
                                        animate="in"
                                        exit="out"
                                        variants={pageVariants}
                                        transition={pageTransition}
                                        style={{
                                            position: "absolute",
                                            width: "100%",
                                            height: "100%",
                                            overflow: "auto",
                                        }}
                                    >
                                        <div
                                            style={{
                                                ...headingFont,
                                                color: textColor,
                                                marginBottom: "0.875rem",
                                                fontSize: "1.75rem",
                                                fontWeight: 800,
                                            }}
                                        >
                                            Choose Your Video Style
                                        </div>
                                        <div
                                            style={{
                                                ...bodyFont,
                                                color: textColor,
                                                opacity: 0.95,
                                                marginBottom: "1.125rem",
                                                fontSize: "1rem",
                                            }}
                                        >
                                            Select the type of video content
                                        </div>

                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns:
                                                    "repeat(auto-fit, minmax(12.5rem, 1fr))",
                                                gap: "0.875rem",
                                            }}
                                        >
                                            {videoStyles
                                                .slice(0, 6)
                                                .map((style) => {
                                                    const isSelected =
                                                        selectedStyle ===
                                                        style.id
                                                    const bgColor = isSelected
                                                        ? primaryColor
                                                        : cardColor
                                                    const cardTextColor =
                                                        isSelected
                                                            ? textOnPrimary
                                                            : textColor

                                                    return (
                                                        <motion.button
                                                            key={style.id}
                                                            whileHover={{
                                                                scale: 1.02,
                                                                y: -2,
                                                            }}
                                                            whileTap={{
                                                                scale: 0.98,
                                                            }}
                                                            onClick={() =>
                                                                handleStyleSelect(
                                                                    style.id
                                                                )
                                                            }
                                                            style={{
                                                                padding:
                                                                    "1.125rem",
                                                                backgroundColor:
                                                                    bgColor,
                                                                border: isSelected
                                                                    ? `3px solid #FFFFFF`
                                                                    : `2px solid ${accentColor}`,
                                                                borderRadius:
                                                                    "0.75rem",
                                                                ...BUTTON_STYLES.base,
                                                                boxShadow:
                                                                    isSelected
                                                                        ? `0 8px 24px ${primaryColor}40`
                                                                        : "none",
                                                                textAlign:
                                                                    "left",
                                                            }}
                                                            role="button"
                                                            aria-label={`Select ${style.title} style`}
                                                            aria-pressed={
                                                                isSelected
                                                            }
                                                        >
                                                            <div
                                                                style={{
                                                                    ...headingFont,
                                                                    fontSize:
                                                                        "1.125rem",
                                                                    color: cardTextColor,
                                                                    marginBottom:
                                                                        "0.5rem",
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                {style.title}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    ...bodyFont,
                                                                    fontSize:
                                                                        "0.9375rem",
                                                                    color: cardTextColor,
                                                                    opacity: 0.9,
                                                                    lineHeight: 1.4,
                                                                }}
                                                            >
                                                                {
                                                                    style.description
                                                                }
                                                            </div>
                                                        </motion.button>
                                                    )
                                                })}
                                        </div>

                                        {/* Custom style - Layout shift 방지 */}
                                        <div
                                            style={{
                                                marginTop: "0.875rem",
                                                minHeight:
                                                    selectedStyle === "other"
                                                        ? "5rem"
                                                        : "3.5rem",
                                                transition:
                                                    "min-height 0.3s ease",
                                            }}
                                        >
                                            <motion.button
                                                whileHover={{
                                                    scale: 1.02,
                                                    y: -2,
                                                }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() =>
                                                    handleStyleSelect("other")
                                                }
                                                style={{
                                                    width: "100%",
                                                    padding: "1.125rem",
                                                    backgroundColor:
                                                        selectedStyle ===
                                                        "other"
                                                            ? primaryColor
                                                            : cardColor,
                                                    border:
                                                        selectedStyle ===
                                                        "other"
                                                            ? `3px solid #FFFFFF`
                                                            : `2px solid ${accentColor}`,
                                                    borderRadius: "0.75rem",
                                                    ...BUTTON_STYLES.base,
                                                    boxShadow:
                                                        selectedStyle ===
                                                        "other"
                                                            ? `0 8px 24px ${primaryColor}40`
                                                            : "none",
                                                    textAlign: "left",
                                                }}
                                                role="button"
                                                aria-label="Select custom style"
                                                aria-pressed={
                                                    selectedStyle === "other"
                                                }
                                            >
                                                <div
                                                    style={{
                                                        ...headingFont,
                                                        fontSize: "1.125rem",
                                                        color:
                                                            selectedStyle ===
                                                            "other"
                                                                ? textOnPrimary
                                                                : textColor,
                                                        marginBottom: "0.5rem",
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    Other
                                                </div>
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        fontSize: "0.9375rem",
                                                        color:
                                                            selectedStyle ===
                                                            "other"
                                                                ? textOnPrimary
                                                                : textColor,
                                                        opacity: 0.75,
                                                        lineHeight: 1.4,
                                                        marginBottom:
                                                            selectedStyle ===
                                                            "other"
                                                                ? "0.75rem"
                                                                : 0,
                                                    }}
                                                >
                                                    Custom style
                                                </div>
                                                <AnimatePresence>
                                                    {selectedStyle ===
                                                        "other" && (
                                                        <motion.input
                                                            initial={{
                                                                opacity: 0,
                                                                height: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                                height: "auto",
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                                height: 0,
                                                            }}
                                                            transition={{
                                                                duration: 0.2,
                                                                ease: "easeOut",
                                                            }}
                                                            type="text"
                                                            value={
                                                                customStyleName
                                                            }
                                                            onChange={(e) => {
                                                                e.stopPropagation()
                                                                setCustomStyleName(
                                                                    e.target
                                                                        .value
                                                                )
                                                            }}
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                            placeholder="e.g., ASMR mukbang"
                                                            style={{
                                                                width: "100%",
                                                                padding:
                                                                    "0.75rem 0.875rem",
                                                                border: `1.5px solid ${primaryColor}`,
                                                                borderRadius:
                                                                    "0.625rem",
                                                                backgroundColor:
                                                                    backgroundColor,
                                                                color: textColor,
                                                                ...bodyFont,
                                                                fontSize:
                                                                    "0.9375rem",
                                                                outline: `2px solid ${primaryColor}`,
                                outlineOffset: "2px",
                                                            }}
                                                            aria-label="Custom style name"
                                                        />
                                                    )}
                                                </AnimatePresence>
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === 2 && (
                                    <motion.div
                                        key="step2"
                                        initial="initial"
                                        animate="in"
                                        exit="out"
                                        variants={pageVariants}
                                        transition={pageTransition}
                                        style={{
                                            position: "absolute",
                                            width: "100%",
                                            height: "100%",
                                            overflow: "auto",
                                        }}
                                    >
                                        <div
                                            style={{
                                                ...headingFont,
                                                color: textColor,
                                                marginBottom: "0.875rem",
                                                fontSize: "1.75rem",
                                                fontWeight: 800,
                                            }}
                                        >
                                            Describe Your Idea
                                        </div>
                                        <div
                                            style={{
                                                ...bodyFont,
                                                color: textColor,
                                                opacity: 0.95,
                                                marginBottom: "1.125rem",
                                                fontSize: "1rem",
                                            }}
                                        >
                                            What unique angle do you want to
                                            take?
                                        </div>

                                        <div
                                            style={{ marginBottom: "1.125rem" }}
                                        >
                                            <div
                                                style={{
                                                    ...bodyFont,
                                                    color: textColor,
                                                    marginBottom: "0.5rem",
                                                    fontSize: "0.9375rem",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                Style:{" "}
                                                <span
                                                    style={{
                                                        color: primaryColor,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {selectedStyle ===
                                                        "other" &&
                                                    customStyleName
                                                        ? customStyleName
                                                        : videoStyles.find(
                                                              (s) =>
                                                                  s.id ===
                                                                  selectedStyle
                                                          )?.title}
                                                </span>
                                                {broadTopic && (
                                                    <>
                                                        {" | Topic: "}
                                                        <span
                                                            style={{
                                                                color: primaryColor,
                                                                fontWeight: 700,
                                                            }}
                                                        >
                                                            {broadTopic}
                                                        </span>
                                                    </>
                                                )}
                                            </div>

                                            <input
                                                type="text"
                                                value={keyword}
                                                onChange={(e) =>
                                                    setKeyword(e.target.value)
                                                }
                                                placeholder="e.g., 5-minute morning workout for busy professionals"
                                                style={{
                                                    width: "100%",
                                                    padding: "1rem",
                                                    border: `2px solid ${keyword ? primaryColor : "#E5E5E5"}`,
                                                    borderRadius: "0.625rem",
                                                    backgroundColor: cardColor,
                                                    color: textColor,
                                                    ...bodyFont,
                                                    fontSize: "1.0625rem",
                                                    outline: `2px solid ${primaryColor}`,
                                outlineOffset: "2px",
                                                    transition: "all 0.2s ease",
                                                    boxShadow: keyword
                                                        ? `0 0 0 3px ${primaryColor}18`
                                                        : "none",
                                                }}
                                                onFocus={(e) => {
                                                    e.target.style.borderColor =
                                                        primaryColor
                                                }}
                                                onBlur={(e) => {
                                                    e.target.style.borderColor =
                                                        keyword
                                                            ? primaryColor
                                                            : "#E5E5E5"
                                                }}
                                                aria-label="Describe your idea"
                                            />
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === 3 && (
                                    <motion.div
                                        key="step3"
                                        initial="initial"
                                        animate="in"
                                        exit="out"
                                        variants={pageVariants}
                                        transition={pageTransition}
                                        style={{
                                            position: "absolute",
                                            width: "100%",
                                            height: "100%",
                                            overflow: "auto",
                                        }}
                                    >
                                        <div
                                            style={{
                                                ...headingFont,
                                                color: textColor,
                                                marginBottom: "0.875rem",
                                                fontSize: "1.75rem",
                                                fontWeight: 800,
                                            }}
                                        >
                                            Customize Your Script
                                        </div>
                                        <div
                                            style={{
                                                ...bodyFont,
                                                color: textColor,
                                                opacity: 0.95,
                                                marginBottom: "1.125rem",
                                                fontSize: "1rem",
                                            }}
                                        >
                                            Adjust length, tone, and language
                                        </div>

                                        <div
                                            style={{
                                                display: "grid",
                                                gridTemplateColumns:
                                                    "repeat(auto-fit, minmax(17.5rem, 1fr))",
                                                gap: "1.25rem",
                                            }}
                                        >
                                            {/* Script Length */}
                                            <div
                                                style={{ gridColumn: "1 / -1" }}
                                            >
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        color: textColor,
                                                        marginBottom: "0.75rem",
                                                        fontSize: "0.9375rem",
                                                        fontWeight: 700,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "space-between",
                                                    }}
                                                >
                                                    <span>
                                                        Script Length:{" "}
                                                        {(() => {
                                                            if (
                                                                scriptLength <
                                                                60
                                                            ) {
                                                                return `${scriptLength} seconds`
                                                            } else {
                                                                const minutes =
                                                                    Math.floor(
                                                                        scriptLength /
                                                                            60
                                                                    )
                                                                const seconds =
                                                                    scriptLength %
                                                                    60
                                                                if (
                                                                    seconds ===
                                                                    0
                                                                ) {
                                                                    return `${minutes} minute${minutes > 1 ? "s" : ""}`
                                                                } else {
                                                                    return `${minutes} minute${minutes > 1 ? "s" : ""} ${seconds} second${seconds > 1 ? "s" : ""}`
                                                                }
                                                            }
                                                        })()}
                                                    </span>
                                                    <motion.button
                                                        whileHover={{
                                                            scale: 1.05,
                                                        }}
                                                        whileTap={{
                                                            scale: 0.95,
                                                        }}
                                                        onClick={() =>
                                                            setShowCustomLength(
                                                                !showCustomLength
                                                            )
                                                        }
                                                        style={{
                                                            padding:
                                                                "0.375rem 0.75rem",
                                                            backgroundColor: cardColor,
                                                            border: `1.5px solid ${accentColor}`,
                                                            borderRadius:
                                                                "0.5rem",
                                                            color: textColor,
                                                            ...bodyFont,
                                                            fontSize: "0.75rem",
                                                            ...BUTTON_STYLES.base,
                                                            fontWeight: 600,
                                                        }}
                                                        aria-label={`${showCustomLength ? "Quick picks" : "Advanced settings"} mode`}
                                                    >
                                                        {showCustomLength
                                                            ? "Quick"
                                                            : "Custom"}
                                                    </motion.button>
                                                </div>

                                                <AnimatePresence>
                                                    {!showCustomLength ? (
                                                        <motion.div
                                                            key="segments"
                                                            initial={{
                                                                opacity: 0,
                                                                height: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                                height: "auto",
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                                height: 0,
                                                            }}
                                                            style={{
                                                                display: "flex",
                                                                gap: "0.5rem",
                                                                flexWrap:
                                                                    "wrap",
                                                            }}
                                                        >
                                                            {scriptSegments.map(
                                                                (seg) => {
                                                                    const isSelected =
                                                                        scriptLength ===
                                                                        seg
                                                                    return (
                                                                        <motion.button
                                                                            key={
                                                                                seg
                                                                            }
                                                                            whileHover={{
                                                                                scale: 1.04,
                                                                                y: -2,
                                                                            }}
                                                                            whileTap={{
                                                                                scale: 0.96,
                                                                            }}
                                                                            onClick={() =>
                                                                                setScriptLength(
                                                                                    seg
                                                                                )
                                                                            }
                                                                            style={{
                                                                                flex: "1 1 3.75rem",
                                                                                padding:
                                                                                    "0.75rem",
                                                                                backgroundColor:
                                                                                    isSelected
                                                                                        ? primaryColor
                                                                                        : cardColor,
                                                                                border: isSelected
                                                                                    ? `2px solid ${primaryColor}`
                                                                                    : `2px solid ${accentColor}`,
                                                                                borderRadius:
                                                                                    "0.625rem",
                                                                                color: isSelected
                                                                                    ? getReadableTextOn(
                                                                                          primaryColor
                                                                                      )
                                                                                    : textColor,
                                                                                ...BUTTON_STYLES.base,
                                                                                ...bodyFont,
                                                                                fontSize:
                                                                                    "0.875rem",
                                                                                fontWeight: 700,
                                                                                boxShadow:
                                                                                    isSelected
                                                                                        ? `0 4px 16px ${primaryColor}35`
                                                                                        : "none",
                                                                            }}
                                                                            aria-label={`${seg < 60 ? `${seg} seconds` : `${Math.floor(seg / 60)} minute${Math.floor(seg / 60) > 1 ? "s" : ""}${seg % 60 > 0 ? ` ${seg % 60} seconds` : ""}`} select`}
                                                                            aria-pressed={
                                                                                isSelected
                                                                            }
                                                                        >
                                                                            {seg < 60
                                                                                ? `${seg}s`
                                                                                : seg % 60 === 0
                                                                                ? `${Math.floor(seg / 60)}m`
                                                                                : `${Math.floor(seg / 60)}m ${seg % 60}s`}
                                                                        </motion.button>
                                                                    )
                                                                }
                                                            )}
                                                        </motion.div>
                                                    ) : (
                                                        <motion.div
                                                            key="slider"
                                                            initial={{
                                                                opacity: 0,
                                                                height: 0,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                                height: "auto",
                                                            }}
                                                            exit={{
                                                                opacity: 0,
                                                                height: 0,
                                                            }}
                                                        >
                                                            <input
                                                                type="range"
                                                                min="15"
                                                                max="180"
                                                                step="1"
                                                                value={
                                                                    scriptLength
                                                                }
                                                                onChange={(e) =>
                                                                    setScriptLength(
                                                                        parseInt(
                                                                            e
                                                                                .target
                                                                                .value
                                                                        )
                                                                    )
                                                                }
                                                                style={{
                                                                    width: "100%",
                                                                    height: "5px",
                                                                    borderRadius:
                                                                        "2.5px",
                                                                    background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${((scriptLength - 15) / (180 - 15)) * 100}%, ${accentColor} ${((scriptLength - 15) / (180 - 15)) * 100}%, ${accentColor} 100%)`,
                                                                    outline: `2px solid ${primaryColor}`,
                                                                    outlineOffset: "2px",
                                                                    appearance:
                                                                        "none",
                                                                    cursor: "pointer",
                                                                }}
                                                                aria-label="Script length slider"
                                                                aria-valuemin={
                                                                    15
                                                                }
                                                                aria-valuemax={
                                                                    180
                                                                }
                                                                aria-valuenow={
                                                                    scriptLength
                                                                }
                                                            />
                                                            <div
                                                                style={{
                                                                    ...bodyFont,
                                                                    color: textColor,
                                                                    opacity: 0.6,
                                                                    fontSize:
                                                                        "0.8125rem",
                                                                    marginTop:
                                                                        "0.5rem",
                                                                }}
                                                            >
                                                                15s to 3min
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            {/* Tone */}
                                            <div>
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        color: textColor,
                                                        marginBottom: "0.75rem",
                                                        fontSize: "0.9375rem",
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    Tone
                                                </div>
                                                <div
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns:
                                                            "repeat(2, 1fr)",
                                                        gap: "0.625rem",
                                                    }}
                                                >
                                                    {toneOptions.map((tone) => {
                                                        const isSelected =
                                                            selectedTone ===
                                                            tone.value
                                                        const bgColor =
                                                            isSelected
                                                                ? primaryColor
                                                                : cardColor
                                                        const toneTextColor =
                                                            isSelected
                                                                ? textOnPrimary
                                                                : textColor
                                                        return (
                                                            <motion.button
                                                                key={tone.value}
                                                                whileHover={{
                                                                    scale: 1.03,
                                                                    y: -2,
                                                                }}
                                                                whileTap={{
                                                                    scale: 0.97,
                                                                }}
                                                                onClick={() =>
                                                                    setSelectedTone(
                                                                        tone.value
                                                                    )
                                                                }
                                                                style={{
                                                                    padding:
                                                                        "0.75rem",
                                                                    backgroundColor:
                                                                        bgColor,
                                                                    border: isSelected
                                                                        ? `3px solid #FFFFFF`
                                                                        : `2px solid ${accentColor}`,
                                                                    borderRadius:
                                                                        "0.625rem",
                                                                    ...BUTTON_STYLES.base,
                                                                    display:
                                                                        "flex",
                                                                    flexDirection:
                                                                        "column",
                                                                    alignItems:
                                                                        "center",
                                                                    gap: "0.375rem",
                                                                    boxShadow:
                                                                        isSelected
                                                                            ? `0 8px 24px ${primaryColor}40`
                                                                            : "none",
                                                                }}
                                                                aria-label={`Select ${tone.value} tone`}
                                                                aria-pressed={
                                                                    isSelected
                                                                }
                                                            >
                                                                <div
                                                                    style={{
                                                                        fontSize:
                                                                            "1.5rem",
                                                                    }}
                                                                >
                                                                    {tone.emoji}
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        ...bodyFont,
                                                                        fontSize:
                                                                            "0.8125rem",
                                                                        color: toneTextColor,
                                                                        fontWeight: 700,
                                                                    }}
                                                                >
                                                                    {tone.value}
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        ...bodyFont,
                                                                        fontSize:
                                                                            "0.6875rem",
                                                                        color: toneTextColor,
                                                                        opacity: 0.6,
                                                                        textAlign:
                                                                            "center",
                                                                    }}
                                                                >
                                                                    {tone.desc}
                                                                </div>
                                                            </motion.button>
                                                        )
                                                    })}
                                                </div>
                                            </div>

                                            {/* Language */}
                                            <div>
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        color: textColor,
                                                        marginBottom: "0.75rem",
                                                        fontSize: "0.9375rem",
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    Language
                                                </div>
                                                <div
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns:
                                                            "repeat(3, 1fr)",
                                                        gap: "0.5rem",
                                                    }}
                                                >
                                                    {languages.map((lang) => {
                                                        const isSelected =
                                                            selectedLanguage ===
                                                            lang.name
                                                        const bgColor =
                                                            isSelected
                                                                ? primaryColor
                                                                : cardColor
                                                        const langTextColor =
                                                            isSelected
                                                                ? textOnPrimary
                                                                : textColor
                                                        return (
                                                            <motion.button
                                                                key={lang.name}
                                                                whileHover={{
                                                                    scale: 1.04,
                                                                    y: -2,
                                                                }}
                                                                whileTap={{
                                                                    scale: 0.96,
                                                                }}
                                                                onClick={() =>
                                                                    setSelectedLanguage(
                                                                        lang.name
                                                                    )
                                                                }
                                                                style={{
                                                                    padding:
                                                                        "0.625rem 0.5rem",
                                                                    backgroundColor:
                                                                        bgColor,
                                                                    border: isSelected
                                                                        ? `3px solid #FFFFFF`
                                                                        : `2px solid ${accentColor}`,
                                                                    borderRadius:
                                                                        "0.625rem",
                                                                    ...BUTTON_STYLES.base,
                                                                    display:
                                                                        "flex",
                                                                    flexDirection:
                                                                        "column",
                                                                    alignItems:
                                                                        "center",
                                                                    gap: "0.25rem",
                                                                    boxShadow:
                                                                        isSelected
                                                                            ? `0 8px 24px ${primaryColor}40`
                                                                            : "none",
                                                                }}
                                                                aria-label={`Select ${lang.name}`}
                                                                aria-pressed={
                                                                    isSelected
                                                                }
                                                            >
                                                                <div
                                                                    style={{
                                                                        fontSize:
                                                                            "1.25rem",
                                                                    }}
                                                                >
                                                                    {lang.flag}
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        ...bodyFont,
                                                                        fontSize:
                                                                            "0.6875rem",
                                                                        color: langTextColor,
                                                                        fontWeight: 600,
                                                                        textAlign:
                                                                            "center",
                                                                    }}
                                                                >
                                                                    {lang.name}
                                                                </div>
                                                            </motion.button>
                                                        )
                                                    })}
                                                </div>
                                                {!showAllLanguages && (
                                                    <motion.button
                                                        whileHover={{
                                                            scale: 1.02,
                                                        }}
                                                        whileTap={{
                                                            scale: 0.98,
                                                        }}
                                                        onClick={() =>
                                                            setShowAllLanguages(
                                                                true
                                                            )
                                                        }
                                                        style={{
                                                            width: "100%",
                                                            marginTop: "0.5rem",
                                                            padding:
                                                                "0.5rem 0.75rem",
                                                            backgroundColor: cardColor,
                                                            border: `2px solid ${accentColor}`,
                                                            borderRadius:
                                                                "0.5rem",
                                                            color: textColor,
                                                            ...BUTTON_STYLES.base,
                                                            ...bodyFont,
                                                            fontSize: "0.75rem",
                                                            fontWeight: 600,
                                                        }}
                                                        aria-label="Show all languages"
                                                    >
                                                        More Languages (
                                                        {allLanguages.length -
                                                            popularLanguages.length}
                                                        )
                                                    </motion.button>
                                                )}
                                            </div>

                                            {/* CTA - Layout shift 방지 */}
                                            <div
                                                style={{
                                                    gridColumn: "1 / -1",
                                                    minHeight: ctaInclusion
                                                        ? "9rem"
                                                        : "6.5rem",
                                                    transition:
                                                        "min-height 0.3s ease",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        color: textColor,
                                                        marginBottom: "0.75rem",
                                                        fontSize: "0.9375rem",
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    Call to Action
                                                </div>
                                                <div
                                                    style={{
                                                        padding: "1rem",
                                                        backgroundColor:
                                                            cardColor,
                                                        borderRadius: "0.75rem",
                                                        border: `2px solid ${ctaInclusion ? primaryColor : accentColor}`,
                                                        transition:
                                                            "all 0.2s ease",
                                                    }}
                                                >
                                                    <label
                                                        style={{
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            justifyContent:
                                                                "space-between",
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        <div>
                                                            <div
                                                                style={{
                                                                    ...bodyFont,
                                                                    fontSize:
                                                                        "0.875rem",
                                                                    color: textColor,
                                                                    fontWeight: 600,
                                                                    marginBottom:
                                                                        "0.25rem",
                                                                }}
                                                            >
                                                                Include CTA
                                                            </div>
                                                            <div
                                                                style={{
                                                                    ...bodyFont,
                                                                    fontSize:
                                                                        "0.75rem",
                                                                    color: textColor,
                                                                    opacity: 0.6,
                                                                }}
                                                            >
                                                                Add subscribe,
                                                                like, follow
                                                            </div>
                                                        </div>

                                                        <motion.div
                                                            onClick={() =>
                                                                setCtaInclusion(
                                                                    !ctaInclusion
                                                                )
                                                            }
                                                            style={{
                                                                width: "3.25rem",
                                                                height: "1.875rem",
                                                                borderRadius:
                                                                    "0.9375rem",
                                                                backgroundColor:
                                                                    ctaInclusion
                                                                        ? primaryColor
                                                                        : `${textColor}40`,
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                padding:
                                                                    "0.1875rem",
                                                                cursor: "pointer",
                                                                transition:
                                                                    "all 0.3s ease",
                                                            }}
                                                            whileHover={{
                                                                scale: 1.05,
                                                            }}
                                                            whileTap={{
                                                                scale: 0.95,
                                                            }}
                                                            role="switch"
                                                            aria-checked={
                                                                ctaInclusion
                                                            }
                                                            aria-label="Include call to action"
                                                        >
                                                            <motion.div
                                                                animate={{
                                                                    x: ctaInclusion
                                                                        ? 22
                                                                        : 0,
                                                                }}
                                                                transition={{
                                                                    type: "spring",
                                                                    stiffness: 500,
                                                                    damping: 30,
                                                                }}
                                                                style={{
                                                                    width: "1.5rem",
                                                                    height: "1.5rem",
                                                                    borderRadius:
                                                                        "50%",
                                                                    backgroundColor:
                                                                        "#fff",
                                                                    boxShadow:
                                                                        "0 2px 6px rgba(0,0,0,0.2)",
                                                                }}
                                                            />
                                                        </motion.div>
                                                    </label>

                                                    <AnimatePresence>
                                                        {ctaInclusion && (
                                                            <motion.div
                                                                initial={{
                                                                    height: 0,
                                                                    opacity: 0,
                                                                    marginTop: 0,
                                                                }}
                                                                animate={{
                                                                    height: "auto",
                                                                    opacity: 1,
                                                                    marginTop:
                                                                        "0.75rem",
                                                                }}
                                                                exit={{
                                                                    height: 0,
                                                                    opacity: 0,
                                                                    marginTop: 0,
                                                                }}
                                                                style={{
                                                                    padding:
                                                                        "0.625rem 0.875rem",
                                                                    backgroundColor: `${primaryColor}10`,
                                                                    borderRadius:
                                                                        "0.5rem",
                                                                    border: `1px solid ${primaryColor}30`,
                                                                    overflow:
                                                                        "hidden",
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        ...bodyFont,
                                                                        fontSize:
                                                                            "0.75rem",
                                                                        color: primaryColor,
                                                                        fontStyle:
                                                                            "italic",
                                                                    }}
                                                                >
                                                                    "Don't
                                                                    forget to
                                                                    like and
                                                                    subscribe!"
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {currentStep === 3.5 && (
                                    <motion.div
                                        key="step3.5"
                                        initial="initial"
                                        animate="in"
                                        exit="out"
                                        variants={pageVariants}
                                        transition={pageTransition}
                                        style={{
                                            position: "absolute",
                                            width: "100%",
                                            height: "100%",
                                            display: "flex",
                                            overflow: "hidden",
                                        }}
                                    >
                                        {windowWidth >= 768 && (
                                            <div
                                                style={{
                                                    width: "3.75rem",
                                                    flexShrink: 0,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    paddingTop: "1.25rem",
                                                    gap: "0.75rem",
                                                }}
                                            >
                                                {Array.from({
                                                    length: chatMessages.filter(
                                                        (m) => m.type === "ai"
                                                    ).length,
                                                }).map((_, index) => {
                                                    const step = index + 1
                                                    const userAnswers =
                                                        chatMessages.filter(
                                                            (m) =>
                                                                m.type ===
                                                                "user"
                                                        ).length
                                                    const isActive =
                                                        step <= userAnswers + 1
                                                    const isComplete =
                                                        step <= userAnswers

                                                    return (
                                                        <div
                                                            key={step}
                                                            style={{
                                                                display: "flex",
                                                                flexDirection:
                                                                    "column",
                                                                alignItems:
                                                                    "center",
                                                                gap: "0.375rem",
                                                            }}
                                                        >
                                                            <motion.div
                                                                initial={{
                                                                    scale: 0.8,
                                                                }}
                                                                animate={{
                                                                    scale: isActive
                                                                        ? 1
                                                                        : 0.8,
                                                                }}
                                                                style={{
                                                                    width: "1.75rem",
                                                                    height: "1.75rem",
                                                                    borderRadius:
                                                                        "50%",
                                                                    backgroundColor:
                                                                        isComplete
                                                                            ? primaryColor
                                                                            : isActive
                                                                              ? `${primaryColor}35`
                                                                              : `${textColor}15`,
                                                                    border: isActive
                                                                        ? `2px solid ${primaryColor}`
                                                                        : `2px solid ${textColor}25`,
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "center",
                                                                    justifyContent:
                                                                        "center",
                                                                    ...bodyFont,
                                                                    fontSize:
                                                                        "0.8125rem",
                                                                    color: isComplete
                                                                        ? textOnPrimary
                                                                        : textColor,
                                                                    fontWeight: 700,
                                                                    transition:
                                                                        "all 0.3s ease",
                                                                }}
                                                                role="progressbar"
                                                                aria-label={`Question ${step}`}
                                                                aria-valuenow={
                                                                    step
                                                                }
                                                                aria-valuemax={
                                                                    chatMessages.filter(
                                                                        (m) =>
                                                                            m.type === "ai"
                                                                    ).length
                                                                }
                                                            >
                                                                {isComplete ? (
                                                                    <svg
                                                                        width="14"
                                                                        height="14"
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke={
                                                                            textOnPrimary
                                                                        }
                                                                        strokeWidth="3"
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                    >
                                                                        <polyline points="20 6 9 17 4 12" />
                                                                    </svg>
                                                                ) : (
                                                                    step
                                                                )}
                                                            </motion.div>
                                                            {step <
                                                                Math.max(
                                                                    3,
                                                                    chatMessages.filter(
                                                                        (m) =>
                                                                            m.type ===
                                                                            "ai"
                                                                    ).length
                                                                ) && (
                                                                <div
                                                                    style={{
                                                                        width: "2px",
                                                                        height: "1.875rem",
                                                                        backgroundColor:
                                                                            isComplete
                                                                                ? primaryColor
                                                                                : `${textColor}15`,
                                                                        transition:
                                                                            "all 0.3s ease",
                                                                    }}
                                                                />
                                                            )}
                                                        </div>
                                                    )
                                                })}

                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        fontSize: "0.6875rem",
                                                        color: textColor,
                                                        opacity: 0.6,
                                                        marginTop: "0.5rem",
                                                        textAlign: "center",
                                                    }}
                                                >
                                                    {
                                                        chatMessages.filter(
                                                            (m) =>
                                                                m.type ===
                                                                "user"
                                                        ).length
                                                    }
                                                    /
                                                    {
                                                        chatMessages.filter(
                                                            (m) =>
                                                                m.type === "ai"
                                                        ).length
                                                    }
                                                </div>
                                            </div>
                                        )}

                                        <div
                                            style={{
                                                flex: 1,
                                                display: "flex",
                                                flexDirection: "column",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    marginBottom: "1rem",
                                                    flexShrink: 0,
                                                    position: "relative",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        ...headingFont,
                                                        color: textColor,
                                                        marginBottom: "0.5rem",
                                                        fontSize: "1.5rem",
                                                        fontWeight: 800,
                                                    }}
                                                >
                                                    Let's Refine Your Script
                                                </div>
                                                <div
                                                    style={{
                                                        ...bodyFont,
                                                        color: textColor,
                                                        opacity: 0.9,
                                                        fontSize: "0.875rem",
                                                    }}
                                                >
                                                    Answer questions to perfect
                                                    it
                                                </div>

                                                <motion.button
                                                    whileHover={{
                                                        scale: 1.04,
                                                        y: -1,
                                                    }}
                                                    whileTap={{ scale: 0.96 }}
                                                    onClick={
                                                        handleSkipRefinement
                                                    }
                                                    style={{
                                                        position: "absolute",
                                                        top: 0,
                                                        right: 0,
                                                        padding:
                                                            "0.5rem 0.875rem",
                                                        backgroundColor: cardColor,
                                                        border: `2px solid ${accentColor}`,
                                                        borderRadius:
                                                            "0.625rem",
                                                        color: textColor,
                                                        ...BUTTON_STYLES.base,
                                                        ...bodyFont,
                                                        fontSize: "0.8125rem",
                                                        fontWeight: 600,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "0.375rem",
                                                    }}
                                                    title="Skip refinement and generate now"
                                                    aria-label="Skip refinement step"
                                                >
                                                    Skip ⏭️
                                                </motion.button>
                                            </div>

                                            {chatMessages.filter(
                                                (m) => m.type === "user"
                                            ).length > 0 && (
                                                <motion.div
                                                    initial={{
                                                        opacity: 0,
                                                        height: 0,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        height: "auto",
                                                    }}
                                                    style={{
                                                        marginBottom: "0.75rem",
                                                        padding: "0.625rem",
                                                        background: `linear-gradient(135deg, ${primaryColor}08 0%, ${primaryColor}03 100%)`,
                                                        borderRadius:
                                                            "0.625rem",
                                                        border: `1px solid ${primaryColor}15`,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            ...bodyFont,
                                                            fontSize:
                                                                "0.6875rem",
                                                            color: primaryColor,
                                                            opacity: 0.7,
                                                            marginBottom:
                                                                "0.375rem",
                                                            textTransform:
                                                                "uppercase",
                                                            letterSpacing:
                                                                "0.05em",
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        Your Answers
                                                    </div>
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            gap: "0.375rem",
                                                            flexWrap: "wrap",
                                                            maxHeight:
                                                                "3.75rem",
                                                            overflowY: "auto",
                                                        }}
                                                    >
                                                        {chatMessages
                                                            .filter(
                                                                (m) =>
                                                                    m.type ===
                                                                    "user"
                                                            )
                                                            .map((msg, idx) => (
                                                                <div
                                                                    key={msg.id}
                                                                    style={{
                                                                        padding:
                                                                            "0.25rem 0.625rem",
                                                                        background: `linear-gradient(135deg, ${primaryColor}18 0%, ${primaryColor}10 100%)`,
                                                                        borderRadius:
                                                                            "0.75rem",
                                                                        border: `1px solid ${primaryColor}25`,
                                                                        ...bodyFont,
                                                                        fontSize:
                                                                            "0.6875rem",
                                                                        color: primaryColor,
                                                                        fontWeight: 600,
                                                                    }}
                                                                >
                                                                    {idx + 1}.{" "}
                                                                    {msg.content.slice(
                                                                        0,
                                                                        25
                                                                    )}
                                                                    {msg.content
                                                                        .length >
                                                                    25
                                                                        ? "..."
                                                                        : ""}
                                                                </div>
                                                            ))}
                                                    </div>
                                                </motion.div>
                                            )}

                                            <div
                                                ref={chatScrollRef}
                                                style={{
                                                    flex: 1,
                                                    minHeight: 0,
                                                    overflowY: "auto",
                                                    marginBottom: "0.75rem",
                                                    padding: "1rem",
                                                    background: `linear-gradient(135deg, ${cardColor}cc 0%, ${cardColor}ee 100%)`,
                                                    borderRadius: "0.875rem",
                                                    border: `1.5px solid ${accentColor}`,
                                                    boxShadow:
                                                        "inset 0 2px 8px rgba(0,0,0,0.08)",
                                                }}
                                            >
                                                {isLoading &&
                                                chatMessages.length === 0 ? (
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            flexDirection:
                                                                "column",
                                                            justifyContent:
                                                                "center",
                                                            alignItems:
                                                                "center",
                                                            height: "100%",
                                                            gap: "0.875rem",
                                                        }}
                                                        role="status"
                                                        aria-live="polite"
                                                    >
                                                        <motion.div
                                                            animate={{
                                                                rotate: 360,
                                                            }}
                                                            transition={{
                                                                duration: 1.2,
                                                                repeat: Infinity,
                                                                ease: "linear",
                                                            }}
                                                            style={{
                                                                width: "2.25rem",
                                                                height: "2.25rem",
                                                                borderRadius:
                                                                    "50%",
                                                                border: `3px solid ${accentColor}`,
                                                                borderTopColor:
                                                                    primaryColor,
                                                            }}
                                                        />
                                                        <div
                                                            style={{
                                                                ...bodyFont,
                                                                color: textColor,
                                                                opacity: 0.7,
                                                                fontSize:
                                                                    "0.875rem",
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            Preparing
                                                            questions...
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {chatMessages.map(
                                                            (msg) => (
                                                                <motion.div
                                                                    key={msg.id}
                                                                    initial={{
                                                                        opacity: 0,
                                                                        y: 10,
                                                                    }}
                                                                    animate={{
                                                                        opacity: 1,
                                                                        y: 0,
                                                                    }}
                                                                    transition={{
                                                                        duration: 0.3,
                                                                    }}
                                                                    style={{
                                                                        marginBottom:
                                                                            "1rem",
                                                                        display:
                                                                            "flex",
                                                                        justifyContent:
                                                                            msg.type ===
                                                                            "user"
                                                                                ? "flex-end"
                                                                                : "flex-start",
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{
                                                                            maxWidth:
                                                                                "80%",
                                                                        }}
                                                                    >
                                                                        {msg.type ===
                                                                            "ai" && (
                                                                            <div
                                                                                style={{
                                                                                    display:
                                                                                        "flex",
                                                                                    alignItems:
                                                                                        "center",
                                                                                    gap: "0.5rem",
                                                                                    marginBottom:
                                                                                        "0.375rem",
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    style={{
                                                                                        width: "1.375rem",
                                                                                        height: "1.375rem",
                                                                                        borderRadius:
                                                                                            "50%",
                                                                                        background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                                                                                        display:
                                                                                            "flex",
                                                                                        alignItems:
                                                                                            "center",
                                                                                        justifyContent:
                                                                                            "center",
                                                                                        fontSize:
                                                                                            "0.6875rem",
                                                                                        fontWeight: 700,
                                                                                        color: textOnPrimary,
                                                                                    }}
                                                                                    aria-hidden="true"
                                                                                >
                                                                                    AI
                                                                                </div>
                                                                                <div
                                                                                    style={{
                                                                                        ...bodyFont,
                                                                                        fontSize:
                                                                                            "0.75rem",
                                                                                        color: textColor,
                                                                                        fontWeight: 600,
                                                                                    }}
                                                                                >
                                                                                    AI
                                                                                    Assistant
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        <div
                                                                            style={{
                                                                                padding:
                                                                                    "0.75rem 1rem",
                                                                                borderRadius:
                                                                                    msg.type ===
                                                                                    "user"
                                                                                        ? "1rem 1rem 0.25rem 1rem"
                                                                                        : "1rem 1rem 1rem 0.25rem",
                                                                                background:
                                                                                    msg.type ===
                                                                                    "user"
                                                                                        ? `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}ee 100%)`
                                                                                        : backgroundColor,
                                                                                color:
                                                                                    msg.type ===
                                                                                    "user"
                                                                                        ? textOnPrimary
                                                                                        : textColor,
                                                                                ...bodyFont,
                                                                                fontSize:
                                                                                    "0.875rem",
                                                                                lineHeight: 1.6,
                                                                                boxShadow:
                                                                                    msg.type ===
                                                                                    "user"
                                                                                        ? `0 4px 14px ${primaryColor}35`
                                                                                        : "0 2px 8px rgba(0,0,0,0.12)",
                                                                                border:
                                                                                    msg.type ===
                                                                                    "ai"
                                                                                        ? `1.5px solid ${accentColor}`
                                                                                        : "none",
                                                                                fontWeight:
                                                                                    msg.type ===
                                                                                    "user"
                                                                                        ? 600
                                                                                        : 500,
                                                                                ...WORD_BREAK_STYLE,
                                                                            }}
                                                                        >
                                                                            {
                                                                                msg.content
                                                                            }
                                                                        </div>

                                                                        <div
                                                                            style={{
                                                                                ...bodyFont,
                                                                                fontSize:
                                                                                    "0.625rem",
                                                                                color: textColor,
                                                                                opacity: 0.5,
                                                                                marginTop:
                                                                                    "0.25rem",
                                                                                textAlign:
                                                                                    msg.type ===
                                                                                    "user"
                                                                                        ? "right"
                                                                                        : "left",
                                                                            }}
                                                                        >
                                                                            {new Date(
                                                                                msg.timestamp
                                                                            ).toLocaleTimeString(
                                                                                [],
                                                                                {
                                                                                    hour: "2-digit",
                                                                                    minute: "2-digit",
                                                                                }
                                                                            )}
                                                                        </div>

                                                                        {!!msg
                                                                            .options
                                                                            ?.length && (
                                                                            <motion.div
                                                                                initial={{
                                                                                    opacity: 0,
                                                                                    y: -5,
                                                                                }}
                                                                                animate={{
                                                                                    opacity: 1,
                                                                                    y: 0,
                                                                                }}
                                                                                transition={{
                                                                                    delay: 0.2,
                                                                                }}
                                                                                style={{
                                                                                    display:
                                                                                        "flex",
                                                                                    gap: "0.5rem",
                                                                                    flexWrap:
                                                                                        "wrap",
                                                                                    marginTop:
                                                                                        "0.625rem",
                                                                                }}
                                                                            >
                                                                                {msg.options?.map(
                                                                                    (
                                                                                        opt
                                                                                    ) => (
                                                                                        <motion.button
                                                                                            key={
                                                                                                opt
                                                                                            }
                                                                                            whileHover={{
                                                                                                scale: 1.04,
                                                                                                y: -1,
                                                                                            }}
                                                                                            whileTap={{
                                                                                                scale: 0.96,
                                                                                            }}
                                                                                            onClick={() =>
                                                                                                handleChatResponse(
                                                                                                    opt,
                                                                                                    msg.id
                                                                                                )
                                                                                            }
                                                                                            style={{
                                                                                                padding:
                                                                                                    "0.5rem 0.875rem",
                                                                                                borderRadius:
                                                                                                    "0.625rem",
                                                                                                ...BUTTON_STYLES.base,
                                                                                                ...BUTTON_STYLES.primary(
                                                                                                    primaryColor,
                                                                                                    textOnPrimary
                                                                                                ),
                                                                                                ...bodyFont,
                                                                                                fontSize:
                                                                                                    "0.8125rem",
                                                                                                fontWeight: 700,
                                                                                                boxShadow: `0 2px 8px ${primaryColor}25`,
                                                                                            }}
                                                                                            onMouseEnter={(
                                                                                                e
                                                                                            ) => {
                                                                                                e.currentTarget.style.boxShadow = `0 4px 14px ${primaryColor}40`
                                                                                            }}
                                                                                            onMouseLeave={(
                                                                                                e
                                                                                            ) => {
                                                                                                e.currentTarget.style.boxShadow = `0 2px 8px ${primaryColor}25`
                                                                                            }}
                                                                                            title={`Select: ${opt}`}
                                                                                            aria-label={`Select ${opt}`}
                                                                                        >
                                                                                            {
                                                                                                opt
                                                                                            }
                                                                                        </motion.button>
                                                                                    )
                                                                                )}
                                                                            </motion.div>
                                                                        )}
                                                                    </div>
                                                                </motion.div>
                                                            )
                                                        )}

                                                        {isTyping && (
                                                            <motion.div
                                                                initial={{
                                                                    opacity: 0,
                                                                }}
                                                                animate={{
                                                                    opacity: 1,
                                                                }}
                                                                style={{
                                                                    display:
                                                                        "flex",
                                                                    gap: "0.5rem",
                                                                    alignItems:
                                                                        "flex-start",
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        width: "1.375rem",
                                                                        height: "1.375rem",
                                                                        borderRadius:
                                                                            "50%",
                                                                        background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                                                                        display:
                                                                            "flex",
                                                                        alignItems:
                                                                            "center",
                                                                        justifyContent:
                                                                            "center",
                                                                        fontSize:
                                                                            "0.6875rem",
                                                                        fontWeight: 700,
                                                                        color: textOnPrimary,
                                                                        flexShrink: 0,
                                                                    }}
                                                                    aria-hidden="true"
                                                                >
                                                                    AI
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        padding:
                                                                            "0.75rem 1rem",
                                                                        borderRadius:
                                                                            "1rem 1rem 1rem 0.25rem",
                                                                        backgroundColor:
                                                                            backgroundColor,
                                                                        border: `1.5px solid ${accentColor}`,
                                                                        boxShadow:
                                                                            "0 2px 8px rgba(0,0,0,0.12)",
                                                                        ...bodyFont,
                                                                        fontSize:
                                                                            "0.875rem",
                                                                        color: textColor,
                                                                        lineHeight: 1.6,
                                                                        minHeight:
                                                                            "2.625rem",
                                                                        display:
                                                                            "flex",
                                                                        alignItems:
                                                                            "center",
                                                                        ...WORD_BREAK_STYLE,
                                                                    }}
                                                                    role="status"
                                                                    aria-live="polite"
                                                                >
                                                                    {typingText ||
                                                                        " "}
                                                                    <motion.span
                                                                        animate={{
                                                                            opacity:
                                                                                [
                                                                                    1,
                                                                                    0,
                                                                                ],
                                                                        }}
                                                                        transition={{
                                                                            duration: 0.8,
                                                                            repeat: Infinity,
                                                                        }}
                                                                    >
                                                                        |
                                                                    </motion.span>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            <div
                                                style={{
                                                    padding: "0.875rem",
                                                    background: `linear-gradient(135deg, ${cardColor} 0%, ${backgroundColor} 100%)`,
                                                    borderRadius: "0.875rem",
                                                    border: `1.5px solid ${accentColor}`,
                                                    boxShadow:
                                                        "0 -2px 12px rgba(0,0,0,0.06)",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: "0.625rem",
                                                        position: "relative",
                                                    }}
                                                >
                                                    <textarea
                                                        ref={inputRef}
                                                        value={userInput}
                                                        onChange={(e) =>
                                                            setUserInput(
                                                                e.target.value
                                                            )
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                    "Enter" &&
                                                                !e.shiftKey &&
                                                                userInput.trim()
                                                            ) {
                                                                e.preventDefault()
                                                                handleChatResponse(
                                                                    userInput.trim()
                                                                )
                                                            }
                                                        }}
                                                        placeholder="Type your reply... (Shift+Enter: newline)"
                                                        style={{
                                                            flex: 1,
                                                            minHeight: "3rem",
                                                            maxHeight: "7.5rem",
                                                            padding:
                                                                "0.75rem 1rem 0.75rem 1rem",
                                                            borderRadius:
                                                                "0.8125rem",
                                                            border: `1.5px solid ${userInput ? primaryColor : accentColor}`,
                                                            backgroundColor:
                                                                backgroundColor,
                                                            color: textColor,
                                                            ...bodyFont,
                                                            fontSize:
                                                                "0.9375rem",
                                                            outline: `2px solid ${primaryColor}`,
                                outlineOffset: "2px",
                                                            transition:
                                                                "all 0.2s ease",
                                                            fontWeight: 500,
                                                            resize: "none",
                                                            ...WORD_BREAK_STYLE,
                                                        }}
                                                        onFocus={(e) => {
                                                            e.target.style.borderColor =
                                                                primaryColor
                                                            e.target.style.boxShadow = `0 0 0 3px ${primaryColor}15`
                                                        }}
                                                        onBlur={(e) => {
                                                            e.target.style.borderColor =
                                                                userInput
                                                                    ? primaryColor
                                                                    : accentColor
                                                            e.target.style.boxShadow =
                                                                "none"
                                                        }}
                                                        aria-label="Type your reply"
                                                    />
                                                    <div
                                                        style={{
                                                            position:
                                                                "absolute",
                                                            bottom: "0.375rem",
                                                            right: "3.75rem",
                                                            ...bodyFont,
                                                            fontSize:
                                                                "0.6875rem",
                                                            color: textColor,
                                                            opacity: 0.5,
                                                        }}
                                                        aria-live="polite"
                                                        aria-atomic="true"
                                                    >
                                                        {userInput.length}
                                                    </div>

                                                    <motion.button
                                                        whileHover={{
                                                            scale: userInput.trim()
                                                                ? 1.04
                                                                : 1,
                                                        }}
                                                        whileTap={{
                                                            scale: userInput.trim()
                                                                ? 0.96
                                                                : 1,
                                                        }}
                                                        onClick={() =>
                                                            userInput.trim() &&
                                                            handleChatResponse(
                                                                userInput.trim()
                                                            )
                                                        }
                                                        disabled={
                                                            !userInput.trim()
                                                        }
                                                        style={{
                                                            width: "3rem",
                                                            height: "3rem",
                                                            borderRadius:
                                                                "0.8125rem",
                                                            ...BUTTON_STYLES.base,
                                                            ...(userInput.trim()
                                                                ? BUTTON_STYLES.primary(
                                                                      primaryColor,
                                                                      textOnPrimary
                                                                  )
                                                                : {
                                                                      background: `${textColor}15`,
                                                                      color: `${textColor}40`,
                                                                      cursor: "not-allowed",
                                                                  }),
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            justifyContent:
                                                                "center",
                                                            boxShadow:
                                                                userInput.trim()
                                                                    ? `0 4px 14px ${primaryColor}35`
                                                                    : "none",
                                                            flexShrink: 0,
                                                        }}
                                                        aria-label="Send message"
                                                    >
                                                        <svg
                                                            width="20"
                                                            height="20"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <line
                                                                x1="22"
                                                                y1="2"
                                                                x2="11"
                                                                y2="13"
                                                            />
                                                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                                        </svg>
                                                    </motion.button>
                                                </div>
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {showSkipConfirm && (
                                                <motion.div
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    style={{
                                                        position: "absolute",
                                                        inset: 0,
                                                        backgroundColor:
                                                            "rgba(0,0,0,0.65)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent:
                                                            "center",
                                                        zIndex: Z_INDEX.MODAL,
                                                        backdropFilter:
                                                            "blur(6px)",
                                                    }}
                                                    onClick={() =>
                                                        setShowSkipConfirm(
                                                            false
                                                        )
                                                    }
                                                    role="dialog"
                                                    aria-modal="true"
                                                    aria-labelledby="skip-dialog-title"
                                                >
                                                    <motion.div
                                                        initial={{
                                                            scale: 0.9,
                                                            y: 20,
                                                        }}
                                                        animate={{
                                                            scale: 1,
                                                            y: 0,
                                                        }}
                                                        exit={{
                                                            scale: 0.9,
                                                            y: 20,
                                                        }}
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                        style={{
                                                            backgroundColor:
                                                                cardColor,
                                                            padding: "1.875rem",
                                                            borderRadius:
                                                                "1.125rem",
                                                            maxWidth:
                                                                "26.25rem",
                                                            border: `2px solid ${accentColor}`,
                                                            boxShadow:
                                                                "0 24px 60px rgba(0,0,0,0.5)",
                                                        }}
                                                    >
                                                        <div
                                                            id="skip-dialog-title"
                                                            style={{
                                                                ...headingFont,
                                                                fontSize:
                                                                    "1.5rem",
                                                                color: textColor,
                                                                marginBottom:
                                                                    "1rem",
                                                                fontWeight: 800,
                                                            }}
                                                        >
                                                            Skip Refinement?
                                                        </div>
                                                        <div
                                                            style={{
                                                                ...bodyFont,
                                                                fontSize:
                                                                    "0.9375rem",
                                                                color: textColor,
                                                                opacity: 0.85,
                                                                marginBottom:
                                                                    "1.625rem",
                                                                lineHeight: 1.7,
                                                            }}
                                                        >
                                                            Answering questions
                                                            helps AI create a
                                                            more accurate and
                                                            personalized script.
                                                            Skipping will
                                                            generate with
                                                            default settings.
                                                        </div>
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                gap: "0.75rem",
                                                            }}
                                                        >
                                                            <motion.button
                                                                whileHover={{
                                                                    scale: 1.02,
                                                                }}
                                                                whileTap={{
                                                                    scale: 0.98,
                                                                }}
                                                                onClick={() =>
                                                                    setShowSkipConfirm(
                                                                        false
                                                                    )
                                                                }
                                                                style={{
                                                                    flex: 1,
                                                                    padding:
                                                                        "0.875rem",
                                                                    borderRadius:
                                                                        "0.75rem",
                                                                    ...BUTTON_STYLES.base,
                                                                    ...BUTTON_STYLES.secondary(
                                                                        "transparent",
                                                                        textColor
                                                                    ),
                                                                    border: `1.5px solid ${accentColor}`,
                                                                    ...bodyFont,
                                                                    fontSize:
                                                                        "0.9375rem",
                                                                    fontWeight: 600,
                                                                }}
                                                                aria-label="Continue refinement"
                                                            >
                                                                Continue
                                                            </motion.button>
                                                            <motion.button
                                                                whileHover={{
                                                                    scale: 1.02,
                                                                }}
                                                                whileTap={{
                                                                    scale: 0.98,
                                                                }}
                                                                onClick={
                                                                    confirmSkip
                                                                }
                                                                style={{
                                                                    flex: 1,
                                                                    padding:
                                                                        "0.875rem",
                                                                    borderRadius:
                                                                        "0.75rem",
                                                                    ...BUTTON_STYLES.base,
                                                                    ...BUTTON_STYLES.primary(
                                                                        primaryColor,
                                                                        textOnPrimary
                                                                    ),
                                                                    ...bodyFont,
                                                                    fontSize:
                                                                        "0.9375rem",
                                                                    fontWeight: 700,
                                                                    boxShadow: `0 4px 16px ${primaryColor}35`,
                                                                }}
                                                                aria-label="Skip to generation"
                                                            >
                                                                Skip
                                                            </motion.button>
                                                        </div>
                                                    </motion.div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                )}

                                {(currentStep as number) === 4 && (
                                    <motion.div
                                        key="step4"
                                        initial="initial"
                                        animate="in"
                                        exit="out"
                                        variants={pageVariants}
                                        transition={pageTransition}
                                        style={{
                                            position: "absolute",
                                            width: "100%",
                                            height: "100%",
                                            overflow: "auto",
                                        }}
                                    >
                                        <div
                                            style={{
                                                ...headingFont,
                                                color: textColor,
                                                marginBottom: "0.875rem",
                                                fontSize: "1.75rem",
                                                fontWeight: 800,
                                            }}
                                        >
                                            Your Video Script
                                        </div>
                                        <div
                                            style={{
                                                ...bodyFont,
                                                color: textColor,
                                                opacity: 0.95,
                                                marginBottom: "1.125rem",
                                                fontSize: "1rem",
                                            }}
                                        >
                                            AI-generated for your{" "}
                                            {selectedStyle === "other" &&
                                            customStyleName
                                                ? customStyleName.toLowerCase()
                                                : videoStyles
                                                      .find(
                                                          (s) =>
                                                              s.id ===
                                                              selectedStyle
                                                      )
                                                      ?.title?.toLowerCase()}{" "}
                                            video
                                        </div>

                                        {apiResults &&
                                            scoreData &&
                                            !showSidePanel &&
                                            !isLoading && (
                                                <ScoreDisplay
                                                    scores={scoreData}
                                                />
                                            )}

                                        <div
                                            style={{
                                                padding: "1.125rem",
                                                backgroundColor: cardColor,
                                                borderRadius: "0.75rem",
                                                border: `1.5px solid ${accentColor}`,
                                                minHeight: "14.375rem",
                                                marginBottom: "1.125rem",
                                            }}
                                        >
                                            {isLoading ? (
                                                <div
                                                    style={{
                                                        textAlign: "center",
                                                        paddingTop: "3.75rem",
                                                    }}
                                                    role="status"
                                                    aria-live="polite"
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            flexDirection:
                                                                "column",
                                                            gap: "0.75rem",
                                                            marginBottom:
                                                                "1.25rem",
                                                        }}
                                                        aria-hidden="true"
                                                    >
                                                        {[1, 2, 3].map((i) => (
                                                            <motion.div
                                                                key={i}
                                                                animate={{
                                                                    opacity: [
                                                                        0.3,
                                                                        0.6,
                                                                        0.3,
                                                                    ],
                                                                }}
                                                                transition={{
                                                                    duration: 1.5,
                                                                    repeat: Infinity,
                                                                    delay:
                                                                        i * 0.2,
                                                                }}
                                                                style={{
                                                                    height: "1rem",
                                                                    backgroundColor: `${textColor}30`,
                                                                    borderRadius:
                                                                        "0.5rem",
                                                                    width: `${100 - i * 10}%`,
                                                                }}
                                                            />
                                                        ))}
                                                    </div>

                                                    <motion.div
                                                        animate={{
                                                            rotate: 360,
                                                        }}
                                                        transition={{
                                                            duration: 1.5,
                                                            repeat: Infinity,
                                                            ease: "linear",
                                                        }}
                                                        style={{
                                                            width: "2.5rem",
                                                            height: "2.5rem",
                                                            border: `3px solid ${accentColor}`,
                                                            borderTop: `3px solid ${primaryColor}`,
                                                            borderRadius: "50%",
                                                            margin: "0 auto 1rem",
                                                        }}
                                                    />
                                                    <div
                                                        style={{
                                                            ...bodyFont,
                                                            color: textColor,
                                                            opacity: 0.8,
                                                            fontSize: "1rem",
                                                            marginBottom:
                                                                "0.75rem",
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        {currentLoadingMsg}
                                                    </div>
                                                    {retryCount > 0 && (
                                                        <div
                                                            style={{
                                                                ...bodyFont,
                                                                color: textColor,
                                                                opacity: 0.6,
                                                                fontSize:
                                                                    "0.8125rem",
                                                                marginBottom:
                                                                    "1rem",
                                                            }}
                                                        >
                                                            Retry attempt{" "}
                                                            {retryCount}...
                                                            Please wait
                                                        </div>
                                                    )}
                                                    <div
                                                        style={{
                                                            width: "80%",
                                                            height: "6px",
                                                            backgroundColor:
                                                                accentColor,
                                                            borderRadius: "3px",
                                                            margin: "0 auto",
                                                            overflow: "hidden",
                                                            position:
                                                                "relative",
                                                        }}
                                                        role="progressbar"
                                                        aria-valuenow={
                                                            loadingProgress
                                                        }
                                                        aria-valuemin={0}
                                                        aria-valuemax={100}
                                                    >
                                                        <motion.div
                                                            initial={{
                                                                width: "0%",
                                                            }}
                                                            animate={{
                                                                width: `${loadingProgress}%`,
                                                            }}
                                                            transition={{
                                                                duration: 0.5,
                                                            }}
                                                            style={{
                                                                height: "100%",
                                                                background: `linear-gradient(90deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
                                                                boxShadow: `0 0 10px ${primaryColor}50`,
                                                            }}
                                                        />
                                                    </div>
                                                    <div
                                                        style={{
                                                            ...bodyFont,
                                                            color: textColor,
                                                            opacity: 0.6,
                                                            fontSize:
                                                                "0.8125rem",
                                                            marginTop:
                                                                "0.75rem",
                                                        }}
                                                    >
                                                        Estimated time:{" "}
                                                        {Math.max(
                                                            5,
                                                            Math.round(
                                                                estimatedTime *
                                                                    (1 -
                                                                        loadingProgress /
                                                                            100)
                                                            )
                                                        )}{" "}
                                                        s
                                                    </div>
                                                </div>
                                            ) : apiError ? (
                                                <div
                                                    style={{
                                                        textAlign: "center",
                                                        paddingTop: "3.75rem",
                                                    }}
                                                    role="alert"
                                                    aria-live="assertive"
                                                >
                                                    <div
                                                        style={{
                                                            fontSize: "3rem",
                                                            marginBottom:
                                                                "1.25rem",
                                                        }}
                                                        aria-hidden="true"
                                                    >
                                                        {apiError.type ===
                                                        "network"
                                                            ? "📡"
                                                            : apiError.type ===
                                                                "timeout"
                                                              ? "⏱️"
                                                              : "😵"}
                                                    </div>
                                                    <div
                                                        style={{
                                                            ...bodyFont,
                                                            color:
                                                                apiError.type ===
                                                                "network"
                                                                    ? "#f59e0b"
                                                                    : "#ef4444",
                                                            marginBottom:
                                                                "0.75rem",
                                                            fontSize:
                                                                "1.125rem",
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        {apiError.type ===
                                                        "network"
                                                            ? "Disconnected"
                                                            : apiError.type ===
                                                                "timeout"
                                                              ? "Timed out"
                                                              : "Error"}
                                                    </div>
                                                    <div
                                                        style={{
                                                            ...bodyFont,
                                                            color: textColor,
                                                            opacity: 0.8,
                                                            fontSize:
                                                                "0.9375rem",
                                                            marginBottom:
                                                                "1.25rem",
                                                            lineHeight: 1.6,
                                                            maxWidth: "25rem",
                                                            margin: "0 auto 1.25rem",
                                                        }}
                                                    >
                                                        {apiError.message}
                                                    </div>
                                                    {apiError.retryable && (
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                gap: "0.75rem",
                                                                justifyContent:
                                                                    "center",
                                                            }}
                                                        >
                                                            <motion.button
                                                                whileHover={{
                                                                    scale: 1.03,
                                                                }}
                                                                whileTap={{
                                                                    scale: 0.97,
                                                                }}
                                                                onClick={() =>
                                                                    fetchFinalScriptRef.current?.()
                                                                }
                                                                style={{
                                                                    padding:
                                                                        "0.75rem 1.25rem",
                                                                    ...BUTTON_STYLES.base,
                                                                    ...BUTTON_STYLES.primary(
                                                                        primaryColor,
                                                                        textOnPrimary
                                                                    ),
                                                                    borderRadius:
                                                                        "0.625rem",
                                                                    ...buttonFont,
                                                                    fontSize:
                                                                        "0.9375rem",
                                                                    fontWeight: 700,
                                                                }}
                                                                aria-label="Retry generation"
                                                            >
                                                                Retry
                                                            </motion.button>
                                                            <motion.button
                                                                whileHover={{
                                                                    scale: 1.03,
                                                                }}
                                                                whileTap={{
                                                                    scale: 0.97,
                                                                }}
                                                                onClick={() => {
                                                                    setApiError(
                                                                        null
                                                                    )
                                                                    handleBack()
                                                                }}
                                                                style={{
                                                                    padding:
                                                                        "0.75rem 1.25rem",
                                                                    ...BUTTON_STYLES.base,
                                                                    ...BUTTON_STYLES.secondary(
                                                                        "transparent",
                                                                        textColor
                                                                    ),
                                                                    border: `1.5px solid ${accentColor}`,
                                                                    borderRadius:
                                                                        "0.625rem",
                                                                    ...buttonFont,
                                                                    fontSize:
                                                                        "0.9375rem",
                                                                    fontWeight: 600,
                                                                }}
                                                                aria-label="Go back"
                                                            >
                                                                Back
                                                            </motion.button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : apiResults ? (
                                                renderResults()
                                            ) : (
                                                <div
                                                    style={{
                                                        textAlign: "center",
                                                        paddingTop: "3.75rem",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            ...bodyFont,
                                                            color: textColor,
                                                            opacity: 0.5,
                                                            fontSize: "1rem",
                                                        }}
                                                    >
                                                        Ready to generate script
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* 버튼 레이아웃 개선 - 줄바꿈 방지 */}
                                        {apiResults &&
                                            !showSidePanel &&
                                            !isLoading && (
                                                <motion.div
                                                    initial={{
                                                        opacity: 0,
                                                        y: 10,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    transition={{
                                                        duration: 0.3,
                                                        delay: 0.2,
                                                    }}
                                                    style={{
                                                        marginTop: "1.125rem",
                                                        display: "flex",
                                                        gap: "0.75rem",
                                                        justifyContent:
                                                            "center",
                                                        position: "relative",
                                                        flexWrap:
                                                            windowWidth < 500
                                                                ? "wrap"
                                                                : "nowrap",
                                                    }}
                                                >
                                                    <motion.button
                                                        whileHover={{
                                                            scale: 1.03,
                                                            y: -2,
                                                        }}
                                                        whileTap={{
                                                            scale: 0.97,
                                                        }}
                                                        onClick={
                                                            copyToClipboard
                                                        }
                                                        style={{
                                                            position:
                                                                "relative",
                                                            padding:
                                                                windowWidth <
                                                                500
                                                                    ? "0.75rem 1rem"
                                                                    : "0.8125rem 1.5rem",
                                                            ...BUTTON_STYLES.base,
                                                            ...(copySuccess
                                                                ? {
                                                                      backgroundColor:
                                                                          accentColor,
                                                                      border: `1.5px solid ${accentColor}`,
                                                                      color: getReadableTextOn(accentColor),
                                                                  }
                                                                : BUTTON_STYLES.primary(
                                                                      primaryColor,
                                                                      textOnPrimary
                                                                  )),
                                                            borderRadius:
                                                                "0.6875rem",
                                                            ...bodyFont,
                                                            fontSize:
                                                                windowWidth <
                                                                500
                                                                    ? "0.8125rem"
                                                                    : "0.9375rem",
                                                            fontWeight: 700,
                                                            boxShadow:
                                                                copySuccess
                                                                    ? `0 4px 16px ${accentColor}45`
                                                                    : `0 4px 16px ${primaryColor}40`,
                                                            overflow: "hidden",
                                                            flex:
                                                                windowWidth <
                                                                500
                                                                    ? "1 1 100%"
                                                                    : "0 0 auto",
                                                            minWidth:
                                                                windowWidth <
                                                                500
                                                                    ? "auto"
                                                                    : "fit-content",
                                                        }}
                                                        aria-label="Copy to clipboard"
                                                    >
                                                        {copySuccess
                                                            ? "Copied! 🎉"
                                                            : "Copy"}
                                                    </motion.button>

                                                    <div
                                                        ref={moreActionsRef}
                                                        style={{
                                                            position:
                                                                "relative",
                                                            flex:
                                                                windowWidth <
                                                                500
                                                                    ? "1 1 100%"
                                                                    : "0 0 auto",
                                                        }}
                                                    >
                                                        <motion.button
                                                            whileHover={{
                                                                scale: 1.03,
                                                                y: -2,
                                                            }}
                                                            whileTap={{
                                                                scale: 0.97,
                                                            }}
                                                            onClick={() =>
                                                                setShowMoreActions(
                                                                    !showMoreActions
                                                                )
                                                            }
                                                            style={{
                                                                padding:
                                                                    windowWidth <
                                                                    500
                                                                        ? "0.75rem 1rem"
                                                                        : "0.8125rem 1.25rem",
                                                                ...BUTTON_STYLES.base,
                                                                ...BUTTON_STYLES.secondary(
                                                                    cardColor,
                                                                    textColor
                                                                ),
                                                                borderRadius:
                                                                    "0.6875rem",
                                                                ...bodyFont,
                                                                fontSize:
                                                                    windowWidth <
                                                                    500
                                                                        ? "0.8125rem"
                                                                        : "0.9375rem",
                                                                fontWeight: 600,
                                                                boxShadow:
                                                                    "0 2px 10px rgba(0,0,0,0.1)",
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                gap: "0.5rem",
                                                                width: "100%",
                                                                justifyContent:
                                                                    "center",
                                                            }}
                                                            onMouseEnter={(
                                                                e
                                                            ) => {
                                                                e.currentTarget.style.backgroundColor = `${textColor}30`
                                                                e.currentTarget.style.borderColor =
                                                                    textColor
                                                            }}
                                                            onMouseLeave={(
                                                                e
                                                            ) => {
                                                                e.currentTarget.style.backgroundColor =
                                                                    cardColor
                                                                e.currentTarget.style.borderColor = `${textColor}65`
                                                            }}
                                                            aria-label="More actions"
                                                            aria-expanded={
                                                                showMoreActions
                                                            }
                                                        >
                                                            More actions
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2.5"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                style={{
                                                                    transform:
                                                                        showMoreActions
                                                                            ? "rotate(180deg)"
                                                                            : "rotate(0)",
                                                                    transition:
                                                                        "transform 0.2s ease",
                                                                }}
                                                            >
                                                                <polyline points="6 9 12 15 18 9" />
                                                            </svg>
                                                        </motion.button>

                                                        <AnimatePresence>
                                                            {showMoreActions && (
                                                                <motion.div
                                                                    initial={{
                                                                        opacity: 0,
                                                                        y: -10,
                                                                        scale: 0.95,
                                                                    }}
                                                                    animate={{
                                                                        opacity: 1,
                                                                        y: 0,
                                                                        scale: 1,
                                                                    }}
                                                                    exit={{
                                                                        opacity: 0,
                                                                        y: -10,
                                                                        scale: 0.95,
                                                                    }}
                                                                    transition={{
                                                                        duration: 0.2,
                                                                    }}
                                                                    style={{
                                                                        position:
                                                                            "absolute",
                                                                        bottom: "calc(100% + 0.5rem)",
                                                                        right: 0,
                                                                        backgroundColor:
                                                                            cardColor,
                                                                        border: `1.5px solid ${accentColor}`,
                                                                        borderRadius:
                                                                            "0.75rem",
                                                                        padding:
                                                                            "0.5rem",
                                                                        minWidth:
                                                                            "12.5rem",
                                                                        boxShadow:
                                                                            "0 12px 32px rgba(0,0,0,0.2)",
                                                                        zIndex: Z_INDEX.DROPDOWN,
                                                                    }}
                                                                    role="menu"
                                                                >
                                                                    <motion.button
                                                                        whileHover={{
                                                                            x: 3,
                                                                        }}
                                                                        onClick={() => {
                                                                            setShowSidePanel(
                                                                                true
                                                                            )
                                                                            setIsEditMode(
                                                                                true
                                                                            )
                                                                            setEditedScript(
                                                                                typeof apiResults ===
                                                                                    "string"
                                                                                    ? apiResults
                                                                                    : apiResults?.script ||
                                                                                          ""
                                                                            )
                                                                            setShowMoreActions(
                                                                                false
                                                                            )
                                                                        }}
                                                                        style={{
                                                                            width: "100%",
                                                                            padding:
                                                                                "0.75rem 1rem",
                                                                            backgroundColor:
                                                                                "transparent",
                                                                            border: "none",
                                                                            borderRadius:
                                                                                "0.5rem",
                                                                            color: textColor,
                                                                            ...BUTTON_STYLES.base,
                                                                            ...bodyFont,
                                                                            fontSize:
                                                                                "0.875rem",
                                                                            fontWeight: 600,
                                                                            textAlign:
                                                                                "left",
                                                                            display:
                                                                                "flex",
                                                                            alignItems:
                                                                                "center",
                                                                            gap: "0.625rem",
                                                                        }}
                                                                        onMouseEnter={(
                                                                            e
                                                                        ) => {
                                                                            e.currentTarget.style.backgroundColor = `${primaryColor}25`
                                                                        }}
                                                                        onMouseLeave={(
                                                                            e
                                                                        ) => {
                                                                            e.currentTarget.style.backgroundColor =
                                                                                "transparent"
                                                                        }}
                                                                        role="menuitem"
                                                                        aria-label="Improve with AI"
                                                                    >
                                                                        <span
                                                                            style={{
                                                                                fontSize:
                                                                                    "1rem",
                                                                            }}
                                                                        >
                                                                            ✨
                                                                        </span>
                                                                        Improve
                                                                        with AI
                                                                    </motion.button>

                                                                    <motion.button
                                                                        whileHover={{
                                                                            x: 3,
                                                                        }}
                                                                        onClick={() => {
                                                                            downloadScript()
                                                                            setShowMoreActions(
                                                                                false
                                                                            )
                                                                        }}
                                                                        style={{
                                                                            width: "100%",
                                                                            padding:
                                                                                "0.75rem 1rem",
                                                                            backgroundColor:
                                                                                "transparent",
                                                                            border: "none",
                                                                            borderRadius:
                                                                                "0.5rem",
                                                                            color: textColor,
                                                                            ...BUTTON_STYLES.base,
                                                                            ...bodyFont,
                                                                            fontSize:
                                                                                "0.875rem",
                                                                            fontWeight: 600,
                                                                            textAlign:
                                                                                "left",
                                                                            display:
                                                                                "flex",
                                                                            alignItems:
                                                                                "center",
                                                                            gap: "0.625rem",
                                                                        }}
                                                                        onMouseEnter={(
                                                                            e
                                                                        ) => {
                                                                            e.currentTarget.style.backgroundColor = `${primaryColor}25`
                                                                        }}
                                                                        onMouseLeave={(
                                                                            e
                                                                        ) => {
                                                                            e.currentTarget.style.backgroundColor =
                                                                                "transparent"
                                                                        }}
                                                                        role="menuitem"
                                                                        aria-label="Download script"
                                                                    >
                                                                        <span
                                                                            style={{
                                                                                fontSize:
                                                                                    "1rem",
                                                                            }}
                                                                        >
                                                                            💾
                                                                        </span>
                                                                        Download
                                                                    </motion.button>

                                                                    <div
                                                                        style={{
                                                                            height: "1px",
                                                                            backgroundColor:
                                                                                accentColor,
                                                                            margin: "0.375rem 0",
                                                                        }}
                                                                    />
                                                                    <motion.button
                                                                        whileHover={{
                                                                            x: 3,
                                                                        }}
                                                                        onClick={() => {
                                                                            setApiResults(
                                                                                null
                                                                            )
                                                                            setScoreData(
                                                                                null
                                                                            )
                                                                            fetchFinalScriptRef.current?.()
                                                                            setShowMoreActions(
                                                                                false
                                                                            )
                                                                        }}
                                                                        style={{
                                                                            width: "100%",
                                                                            padding:
                                                                                "0.75rem 1rem",
                                                                            backgroundColor:
                                                                                "transparent",
                                                                            border: "none",
                                                                            borderRadius:
                                                                                "0.5rem",
                                                                            color: textColor,
                                                                            ...BUTTON_STYLES.base,
                                                                            ...bodyFont,
                                                                            fontSize:
                                                                                "0.875rem",
                                                                            fontWeight: 600,
                                                                            textAlign:
                                                                                "left",
                                                                            display:
                                                                                "flex",
                                                                            alignItems:
                                                                                "center",
                                                                            gap: "0.625rem",
                                                                        }}
                                                                        onMouseEnter={(
                                                                            e
                                                                        ) => {
                                                                            e.currentTarget.style.backgroundColor = `${primaryColor}25`
                                                                        }}
                                                                        onMouseLeave={(
                                                                            e
                                                                        ) => {
                                                                            e.currentTarget.style.backgroundColor =
                                                                                "transparent"
                                                                        }}
                                                                        role="menuitem"
                                                                        aria-label="Create new script"
                                                                    >
                                                                        <span
                                                                            style={{
                                                                                fontSize:
                                                                                    "1rem",
                                                                            }}
                                                                        >
                                                                            🔄
                                                                        </span>{" "}
                                                                        Create
                                                                        New
                                                                    </motion.button>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </motion.div>
                                            )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {(currentStep as number) !== 4 && (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginTop: "1.125rem",
                                    paddingTop: "0.875rem",
                                    borderTop: `1px solid ${accentColor}`,
                                    flexShrink: 0,
                                }}
                            >
                                <motion.button
                                    whileHover={{
                                        scale:
                                            (currentStep as number) > 1
                                                ? 1.02
                                                : 1,
                                    }}
                                    whileTap={{
                                        scale:
                                            (currentStep as number) > 1
                                                ? 0.98
                                                : 1,
                                    }}
                                    onClick={handleBack}
                                    disabled={(currentStep as number) === 1}
                                    style={{
                                        padding: "0.8125rem 1.375rem",
                                        ...BUTTON_STYLES.base,
                                        ...((currentStep as number) > 1
                                            ? BUTTON_STYLES.secondary(
                                                  cardColor,
                                                  textColor
                                              )
                                            : BUTTON_STYLES.disabled(
                                                  textColor
                                              )),
                                        borderRadius: "0.625rem",
                                        ...buttonFont,
                                        fontSize: "0.9375rem",
                                        fontWeight: 600,
                                    }}
                                    aria-label="Previous step"
                                >
                                    Back
                                </motion.button>

                                <motion.button
                                    whileHover={{
                                        scale: canProceed() ? 1.02 : 1,
                                    }}
                                    whileTap={{
                                        scale: canProceed() ? 0.98 : 1,
                                    }}
                                    onClick={handleNext}
                                    disabled={
                                        !canProceed() ||
                                        (currentStep as number) === 4
                                    }
                                    style={{
                                        padding: "0.8125rem 1.375rem",
                                        ...BUTTON_STYLES.base,
                                        ...(canProceed() &&
                                        (currentStep as number) < 4
                                            ? BUTTON_STYLES.primary(
                                                  primaryColor,
                                                  textOnPrimary
                                              )
                                            : {
                                                  backgroundColor: cardColor,
                                                  border: `2px solid ${textColor}25`,
                                                  color: `${textColor}40`,
                                                  cursor: "not-allowed",
                                              }),
                                        borderRadius: "0.625rem",
                                        ...buttonFont,
                                        display:
                                            (currentStep as number) === 4
                                                ? "none"
                                                : "block",
                                        fontSize: "0.9375rem",
                                        fontWeight: 700,
                                        boxShadow:
                                            canProceed() &&
                                            (currentStep as number) < 4
                                                ? `0 2px 10px ${primaryColor}30`
                                                : "none",
                                    }}
                                    aria-label="Next step"
                                >
                                    Next
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Custom Modal to replace alert/confirm */}
                <AnimatePresence>
                    {modalConfig.show && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: "fixed",
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: "rgba(0, 0, 0, 0.5)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                zIndex: 10000,
                            }}
                            onClick={() => {
                                if (modalConfig.type === "alert") {
                                    modalConfig.onConfirm?.()
                                } else {
                                    modalConfig.onCancel?.()
                                }
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    backgroundColor: cardColor,
                                    borderRadius: "1rem",
                                    padding: "1.5rem",
                                    maxWidth: "28rem",
                                    width: "90%",
                                    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                                    border: `1px solid ${accentColor}`,
                                }}
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="modal-title"
                                aria-describedby="modal-description"
                            >
                                <h2
                                    id="modal-title"
                                    style={{
                                        ...headingFont,
                                        fontSize: "1.25rem",
                                        fontWeight: 700,
                                        color: textColor,
                                        marginBottom: "0.75rem",
                                    }}
                                >
                                    {modalConfig.title}
                                </h2>
                                <p
                                    id="modal-description"
                                    style={{
                                        ...bodyFont,
                                        fontSize: "0.9375rem",
                                        color: textColor,
                                        marginBottom: "1.5rem",
                                        lineHeight: "1.5",
                                    }}
                                >
                                    {modalConfig.message}
                                </p>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: "0.75rem",
                                        justifyContent: "flex-end",
                                    }}
                                >
                                    {modalConfig.type === "confirm" && (
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={modalConfig.onCancel}
                                            style={{
                                                padding: "0.625rem 1.25rem",
                                                borderRadius: "0.5rem",
                                                ...BUTTON_STYLES.base,
                                                ...BUTTON_STYLES.secondary(cardColor, textColor),
                                                ...buttonFont,
                                                fontSize: "0.875rem",
                                                fontWeight: 600,
                                            }}
                                        >
                                            Cancel
                                        </motion.button>
                                    )}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={modalConfig.onConfirm}
                                        style={{
                                            padding: "0.625rem 1.25rem",
                                            borderRadius: "0.5rem",
                                            ...BUTTON_STYLES.base,
                                            ...BUTTON_STYLES.primary(primaryColor, textOnPrimary),
                                            ...buttonFont,
                                            fontSize: "0.875rem",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {modalConfig.type === "confirm" ? "Confirm" : "OK"}
                                    </motion.button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </AnimatePresence>
        </div>
    )
}

addPropertyControls(IdeaGenerator, {
    preview: {
        type: ControlType.Boolean,
        title: "Show in Preview",
        defaultValue: true,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#1A1A1A",
    },
    cardColor: {
        type: ControlType.Color,
        title: "Card Background",
        defaultValue: "#2A2A2A",
    },
    primaryColor: {
        type: ControlType.Color,
        title: "Primary Color",
        defaultValue: "#FFFFFF",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text Color",
        defaultValue: "#FFFFFF",
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent Color",
        defaultValue: "#333333",
    },
    headingFont: {
        type: ControlType.Font,
        title: "Heading Font",
        defaultValue: {
            fontSize: "22px",
            variant: "Bold",
            letterSpacing: "-0.02em",
            lineHeight: "1.2em",
        },
        controls: "extended",
        defaultFontType: "sans-serif",
    },
    bodyFont: {
        type: ControlType.Font,
        title: "Body Font",
        defaultValue: {
            fontSize: "15px",
            variant: "Medium",
            letterSpacing: "-0.01em",
            lineHeight: "1.4em",
        },
        controls: "extended",
        defaultFontType: "sans-serif",
    },
    buttonFont: {
        type: ControlType.Font,
        title: "Button Font",
        defaultValue: {
            fontSize: "13px",
            variant: "Semibold",
            letterSpacing: "-0.01em",
            lineHeight: "1em",
        },
        controls: "extended",
        defaultFontType: "sans-serif",
    },
})
