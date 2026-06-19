using TeamPrompts.Domain.Enums;

namespace TeamPrompts.Application.Abstractions;

/// <summary>Extracts plain text from an uploaded script file (PDF via PdfPig, TXT plain read).</summary>
public interface ITextExtractor
{
    Task<string> ExtractAsync(FileType type, Stream content, CancellationToken ct = default);
}
