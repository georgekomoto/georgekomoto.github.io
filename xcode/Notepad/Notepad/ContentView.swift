import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Note.modifiedAt, order: .reverse) private var notes: [Note]
    @State private var selection: Note?

    var body: some View {
        NavigationSplitView {
            List(selection: $selection) {
                ForEach(notes) { note in
                    NavigationLink(value: note) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(note.title)
                                .lineLimit(1)
                            Text(note.modifiedAt, format: .dateTime.month().day().hour().minute())
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .contextMenu {
                        Button("Delete", systemImage: "trash", role: .destructive) {
                            delete(note)
                        }
                    }
                }
                .onDelete { offsets in
                    offsets.map { notes[$0] }.forEach(delete)
                }
            }
            .navigationTitle("Notes")
            #if os(macOS)
            .navigationSplitViewColumnWidth(min: 200, ideal: 240)
            #endif
            .toolbar {
                ToolbarItem {
                    Button("New Note", systemImage: "square.and.pencil", action: addNote)
                }
            }
        } detail: {
            if let selection {
                NoteEditor(note: selection)
                    .id(selection.id)
            } else {
                ContentUnavailableView(
                    "No Note Selected",
                    systemImage: "note.text",
                    description: Text("Select a note or create a new one.")
                )
            }
        }
    }

    private func addNote() {
        let note = Note()
        context.insert(note)
        selection = note
    }

    private func delete(_ note: Note) {
        if selection == note { selection = nil }
        context.delete(note)
    }
}

struct NoteEditor: View {
    @Bindable var note: Note

    var body: some View {
        TextEditor(text: $note.text)
            .font(.body)
            .padding(8)
            .navigationTitle(note.title)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .onChange(of: note.text) {
                note.modifiedAt = .now
            }
    }
}

#Preview {
    ContentView()
        .modelContainer(for: Note.self, inMemory: true)
}
