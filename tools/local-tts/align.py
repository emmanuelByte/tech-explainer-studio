"""Forced alignment of narration text to its audio, for caption and cue timing.

Reads JSON on stdin: {"items": [{"wav": "<path>", "text": "<spoken text>"}]}
Writes JSON on stdout: {"results": [{"words": [{"text", "start", "end", "score"}], "error": null}]}
Times are seconds from the start of that wav. Uses torchaudio's bundled English
wav2vec2 CTC model (free, runs locally); the first run downloads ~360 MB into
TORCH_HOME. Words are the whitespace-separated words of the text, so captions
can show the original spelling (API paths, acronyms) while only the letters are
aligned.
"""
import json
import re
import sys

import torch
import torchaudio

ONES = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE",
        "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"]
TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"]


def spell(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000:
        return ONES[n // 100] + " HUNDRED" + ("" if n % 100 == 0 else " " + spell(n % 100))
    if n < 1000000:
        return spell(n // 1000) + " THOUSAND" + ("" if n % 1000 == 0 else " " + spell(n % 1000))
    return " ".join(ONES[int(d)] for d in str(n))


def spoken(word: str) -> str:
    """The letters a voice would plausibly say for a displayed word; may be empty (pure symbols)."""
    word = re.sub(r"\d+", lambda m: " " + spell(int(m.group())) + " ", word)
    return re.sub(r"[^A-Z' ]", "", word.upper()).strip()


def main() -> None:
    payload = json.load(sys.stdin)
    bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
    model = bundle.get_model().eval()
    labels = bundle.get_labels()
    index = {c: i for i, c in enumerate(labels)}
    out = []
    for item in payload["items"]:
        try:
            wave, rate = torchaudio.load(item["wav"])
            wave = wave.mean(0, keepdim=True)
            if rate != bundle.sample_rate:
                wave = torchaudio.functional.resample(wave, rate, bundle.sample_rate)
            with torch.inference_mode():
                emission, _ = model(wave)
                emission = torch.log_softmax(emission, dim=-1)
            shown = item["text"].split()
            tokens, owner = [], []
            for w, word in enumerate(shown):
                for part in spoken(word).split():
                    if tokens:
                        tokens.append(index["|"]); owner.append(-1)
                    for ch in part:
                        tokens.append(index[ch]); owner.append(w)
            if not tokens or emission.shape[1] < len(tokens):
                out.append({"words": [], "error": "nothing alignable"}); continue
            aligned, scores = torchaudio.functional.forced_align(emission, torch.tensor([tokens], dtype=torch.int32), blank=0)
            spans = torchaudio.functional.merge_tokens(aligned[0], scores[0].exp())
            seconds_per_frame = wave.shape[1] / emission.shape[1] / bundle.sample_rate
            first, last, conf = {}, {}, {}
            for span, w in zip(spans, owner):
                if w < 0:
                    continue
                first.setdefault(w, span.start * seconds_per_frame)
                last[w] = span.end * seconds_per_frame
                conf.setdefault(w, []).append(span.score)
            words = []
            for w, word in enumerate(shown):
                if w in first:
                    words.append({"text": word, "start": round(first[w], 3), "end": round(last[w], 3), "score": round(sum(conf[w]) / len(conf[w]), 3)})
                else:
                    words.append({"text": word, "start": None, "end": None, "score": 0})
            out.append({"words": words, "error": None})
        except Exception as error:  # one bad clip must not lose the whole batch
            out.append({"words": [], "error": str(error)})
    json.dump({"results": out}, sys.stdout)


if __name__ == "__main__":
    main()
