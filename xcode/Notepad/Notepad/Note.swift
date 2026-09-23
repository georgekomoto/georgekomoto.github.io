import Foundation
import SwiftData

@Model
final class Note {
    var text: String
    var createdAt: Date
    var modifiedAt: Date

    init(text: String = "") {
        self.text = text
        self.createdAt = .now
        self.modifiedAt = .now
    }

    /// First non-empty line of the note, used in the sidebar and title bar.
    var title: String {
        let firstLine = text
            .split(separator: "\n", omittingEmptySubsequences: true)
            .first
            .map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
        return firstLine.isEmpty ? "New Note" : firstLine
    }
}
