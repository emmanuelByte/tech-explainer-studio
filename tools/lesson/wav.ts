/** Minimal WAV reading/joining for narration clips (PCM 16-bit or IEEE float 32). */

export interface Wav {
  /** 1 = PCM, 3 = IEEE float. */
  format: number
  channels: number
  sampleRate: number
  bitsPerSample: number
  data: Buffer
}

export function parseWav(buffer: Buffer): Wav {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file.')
  }
  let fmt: Omit<Wav, 'data'> | null = null
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      fmt = {
        format: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk before fmt chunk.')
      // Streamed WAVs may declare a size past the end of the buffer.
      return { ...fmt, data: buffer.subarray(body, Math.min(buffer.length, body + size)) }
    }
    offset = body + size + (size % 2)
  }
  throw new Error('WAV has no data chunk.')
}

function frameBytes(wav: Pick<Wav, 'channels' | 'bitsPerSample'>) {
  return wav.channels * (wav.bitsPerSample / 8)
}

export function wavSeconds(wav: Wav) {
  return wav.data.length / frameBytes(wav) / wav.sampleRate
}

/** Joins clips of identical format with `gapSeconds` of silence between them. */
export function joinWavs(clips: Wav[], gapSeconds: number): Wav {
  if (!clips.length) throw new Error('Nothing to join.')
  const [first] = clips
  for (const clip of clips) {
    if (clip.format !== first.format || clip.channels !== first.channels
      || clip.sampleRate !== first.sampleRate || clip.bitsPerSample !== first.bitsPerSample) {
      throw new Error('Cannot join WAV clips with different formats.')
    }
  }
  // All-zero bytes are silence in both PCM and IEEE float.
  const gap = Buffer.alloc(Math.round(gapSeconds * first.sampleRate) * frameBytes(first))
  const parts: Buffer[] = []
  clips.forEach((clip, index) => {
    if (index > 0) parts.push(gap)
    parts.push(clip.data)
  })
  return { ...first, data: Buffer.concat(parts) }
}

export function encodeWav(wav: Wav): Buffer {
  const fact = wav.format === 3 ? 12 : 0
  const header = Buffer.alloc(44 + fact)
  const blockAlign = frameBytes(wav)
  let at = 0
  header.write('RIFF', at); at += 4
  header.writeUInt32LE(36 + fact + wav.data.length, at); at += 4
  header.write('WAVE', at); at += 4
  header.write('fmt ', at); at += 4
  header.writeUInt32LE(16, at); at += 4
  header.writeUInt16LE(wav.format, at); at += 2
  header.writeUInt16LE(wav.channels, at); at += 2
  header.writeUInt32LE(wav.sampleRate, at); at += 4
  header.writeUInt32LE(wav.sampleRate * blockAlign, at); at += 4
  header.writeUInt16LE(blockAlign, at); at += 2
  header.writeUInt16LE(wav.bitsPerSample, at); at += 2
  if (fact) {
    header.write('fact', at); at += 4
    header.writeUInt32LE(4, at); at += 4
    header.writeUInt32LE(wav.data.length / blockAlign, at); at += 4
  }
  header.write('data', at); at += 4
  header.writeUInt32LE(wav.data.length, at)
  return Buffer.concat([header, wav.data])
}
