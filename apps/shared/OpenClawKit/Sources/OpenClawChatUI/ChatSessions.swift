import Foundation

public struct OpenClawChatModelChoice: Identifiable, Codable, Sendable, Hashable {
    public var id: String { self.selectionID }

    public let modelID: String
    public let name: String
    public let provider: String
    public let contextWindow: Int?

    public init(modelID: String, name: String, provider: String, contextWindow: Int?) {
        self.modelID = modelID
        self.name = name
        self.provider = provider
        self.contextWindow = contextWindow
    }

    /// Provider-qualified model ref used for picker identity and selection tags.
    public var selectionID: String {
        let trimmedProvider = self.provider.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedProvider.isEmpty else { return self.modelID }
        let providerPrefix = "\(trimmedProvider)/"
        if self.modelID.hasPrefix(providerPrefix) {
            return self.modelID
        }
        return "\(trimmedProvider)/\(self.modelID)"
    }

    public var displayLabel: String {
        self.selectionID
    }
}

public struct OpenClawChatSessionsDefaults: Codable, Sendable {
    public let model: String?
    public let contextTokens: Int?
    public let mainSessionKey: String?

    public init(model: String?, contextTokens: Int?, mainSessionKey: String? = nil) {
        self.model = model
        self.contextTokens = contextTokens
        self.mainSessionKey = mainSessionKey
    }
}

public struct OpenClawChatSessionEntry: Codable, Identifiable, Sendable, Hashable {
    public var id: String { self.key }

    public let key: String
    public let kind: String?
    public let label: String?
    public let displayName: String?
    public let derivedTitle: String?
    public let surface: String?
    public let subject: String?
    public let room: String?
    public let space: String?
    public let updatedAt: Double?
    public let sessionId: String?

    public let systemSent: Bool?
    public let abortedLastRun: Bool?
    public let thinkingLevel: String?
    public let verboseLevel: String?

    public let inputTokens: Int?
    public let outputTokens: Int?
    public let totalTokens: Int?

    public let modelProvider: String?
    public let model: String?
    public let contextTokens: Int?

    public init(
        key: String,
        kind: String?,
        label: String? = nil,
        displayName: String? = nil,
        derivedTitle: String? = nil,
        surface: String? = nil,
        subject: String? = nil,
        room: String? = nil,
        space: String? = nil,
        updatedAt: Double? = nil,
        sessionId: String? = nil,
        systemSent: Bool? = nil,
        abortedLastRun: Bool? = nil,
        thinkingLevel: String? = nil,
        verboseLevel: String? = nil,
        inputTokens: Int? = nil,
        outputTokens: Int? = nil,
        totalTokens: Int? = nil,
        modelProvider: String? = nil,
        model: String? = nil,
        contextTokens: Int? = nil)
    {
        self.key = key
        self.kind = kind
        self.label = label
        self.displayName = displayName
        self.derivedTitle = derivedTitle
        self.surface = surface
        self.subject = subject
        self.room = room
        self.space = space
        self.updatedAt = updatedAt
        self.sessionId = sessionId
        self.systemSent = systemSent
        self.abortedLastRun = abortedLastRun
        self.thinkingLevel = thinkingLevel
        self.verboseLevel = verboseLevel
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.totalTokens = totalTokens
        self.modelProvider = modelProvider
        self.model = model
        self.contextTokens = contextTokens
    }

    public var titleText: String {
        let manual = self.label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !manual.isEmpty { return manual }
        let derived = self.derivedTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !derived.isEmpty { return derived }
        let display = self.displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !display.isEmpty { return display }
        return self.key
    }
}

public struct OpenClawChatSessionsListResponse: Codable, Sendable {
    public let ts: Double?
    public let path: String?
    public let count: Int?
    public let defaults: OpenClawChatSessionsDefaults?
    public let sessions: [OpenClawChatSessionEntry]

    public init(
        ts: Double?,
        path: String?,
        count: Int?,
        defaults: OpenClawChatSessionsDefaults?,
        sessions: [OpenClawChatSessionEntry])
    {
        self.ts = ts
        self.path = path
        self.count = count
        self.defaults = defaults
        self.sessions = sessions
    }
}
