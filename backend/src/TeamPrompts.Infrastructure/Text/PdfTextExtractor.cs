using System.Text;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Domain.Enums;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace TeamPrompts.Infrastructure.Text;

/// <summary>TXT: plain UTF-8 read. PDF: PdfPig with content-ordered text extraction for readable output.</summary>
public sealed class PdfTextExtractor : ITextExtractor
{
    public async Task<string> ExtractAsync(FileType type, Stream content, CancellationToken ct = default)
    {
        if (type == FileType.Txt)
        {
            using var reader = new StreamReader(content, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
            return (await reader.ReadToEndAsync(ct)).Trim();
        }

        // PdfPig needs a seekable stream — buffer the upload into memory first.
        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);
        ms.Position = 0;

        var sb = new StringBuilder();
        using var doc = PdfDocument.Open(ms);
        foreach (var page in doc.GetPages())
        {
            ct.ThrowIfCancellationRequested();
            sb.AppendLine(ContentOrderTextExtractor.GetText(page));
        }
        return sb.ToString().Trim();
    }
}
