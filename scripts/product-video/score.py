"""Compose a quiet, original instrumental bed; no third-party music or samples."""
import sys
import wave
import numpy as np

rate, duration = 44100, 72
audio = np.zeros((rate * duration, 2), dtype=np.float64)
chords = [(57, 60, 64, 67), (53, 57, 60, 64), (48, 55, 60, 64), (55, 59, 62, 67)]
beat = 60 / 96

def note(midi, start, length, gain, pad=False, pan=0):
    begin = int(start * rate)
    count = min(int(length * rate), len(audio) - begin)
    if count <= 0:
        return
    t = np.arange(count) / rate
    hz = 440 * 2 ** ((midi - 69) / 12)
    tone = (np.sin(2 * np.pi * hz * t) + .18 * np.sin(2 * np.pi * hz * 2 * t)
            + .06 * np.sin(2 * np.pi * hz * 3 * t))
    if pad:
        env = np.minimum(t / .75, 1) * np.minimum(np.maximum(length - t, 0) / 1.1, 1)
        tone *= env * (.92 + .08 * np.sin(2 * np.pi * .22 * t))
    else:
        tone *= np.minimum(t / .008, 1) * np.exp(-t * 4)
    audio[begin:begin + count, 0] += tone * gain * (1 - pan * .3)
    audio[begin:begin + count, 1] += tone * gain * (1 + pan * .3)

for bar, start in enumerate(np.arange(0, duration, beat * 8)):
    chord = chords[bar % 4]
    for i, midi in enumerate(chord):
        note(midi, start, beat * 8 + .7, .026, True, (i - 1.5) / 1.5)
    note(chord[0] - 12, start, beat * 7.5, .038, True)
    for j in range(16):
        note(chord[j % 4] + 12, start + j * beat / 2, 1.2,
             .045 if j % 4 == 0 else .022, pan=(-1 if j % 2 else 1) * .65)
    if bar > 1:
        for j, midi in enumerate((76, 79, 74, 72)):
            note(midi, start + beat * (j * 2 + .5), 1.8, .018, pan=.2)

t = np.arange(len(audio)) / rate
audio *= (np.minimum(t / 2, 1) * np.minimum((duration - t) / 4, 1))[:, None]
# Comfortable headroom and no clipping.
audio *= .55 / max(.55, np.max(np.abs(audio)))
pcm = np.int16(np.clip(audio, -1, 1) * 32767)
with wave.open(sys.argv[1], 'wb') as file:
    file.setnchannels(2)
    file.setsampwidth(2)
    file.setframerate(rate)
    file.writeframes(pcm.tobytes())
print('Original 72-second stereo score composed')
