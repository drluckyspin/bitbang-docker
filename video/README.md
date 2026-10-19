# Go Remote teaser

A 45-second product teaser for go-remote, built with [Remotion](https://www.remotion.dev). Every frame is React: the
laptop, the Claude Code session, the container, the QR code, the phone and herdr-web-ui are components, and all text is
rendered rather than baked into images.

## Commands

| Command          | What it does                                                |
| ---------------- | ----------------------------------------------------------- |
| `npm i`          | Install the dependencies                                    |
| `npm run dev`    | Open Remotion Studio, with each scene also registered alone |
| `npm run render` | Render `out/go-remote-teaser.mp4`, 1920 by 1080 at 30 fps   |
| `npm run poster` | Render the thumbnail, `out/go-remote-poster.jpg`            |
| `npm run audio`  | Synthesize the music and foley into `public/audio`          |
| `npm run lint`   | ESLint and `tsc`                                            |

`dev`, `build`, `render` and `poster` run `audio` first. Its output is the same every time, so it stays out of git.

The poster is frame 809, where the laptop's conversation has just landed on the phone. The video's own first frame is a
dim terminal, so upload the poster as the thumbnail wherever a site lets you, and move its frame if the timeline
changes.

## Layout

| Path                     | What it holds                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `src/GoRemoteTeaser.tsx` | The timeline: seven scenes in a `Series`, the captions, grain and sound            |
| `src/timeline.ts`        | Scene lengths and caption timings; the sound cues count from these                 |
| `src/layout.ts`          | Framing shared across cuts. A 9:16 version replaces this file and keeps the scenes |
| `src/scenes/`            | One file per scene                                                                 |
| `src/components/`        | Laptop, terminal, Claude Code, container, connection, phone, herdr-web-ui, QR code |
| `src/data/`              | The scripted session, shared by the laptop's terminal and the phone's chat         |
| `src/Sound.tsx`          | The soundtrack and every sound effect, on the frames the picture cues them         |
| `scripts/make-audio.mjs` | The synthesizer behind `public/audio`                                              |

## Sound

`scripts/make-audio.mjs` synthesizes the soundtrack, the typing, the swooshes, the phone buzz, the ping of the
`/go-remote` pulse and the pop of each message landing on the phone, so the video carries no third-party music. The
soundtrack's beats fall on frames 15 + 20n: beat 12 is Enter on `/go-remote`, 38 the conversation landing on the phone
and 60 the brand. The clicks, dings, switches and whips in `public/audio/sfx` are Remotion's sound effects from
`remotion.media`. The story reads with the sound off.

## Notes

- The QR code is real and scannable. It encodes `https://github.com/drluckyspin/go-remote`, not a pairing link.
- The phone screens recreate herdr-web-ui from the screenshots in `../docs`, with this video's own conversation. The
  approval card follows herdr-web-ui's own prompt card, with Claude Code's three answers.
- The closing scene uses the Go Remote icon from `public/brand`, and is the only scene in its petrol teal.
- Remotion needs a [company license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) for some entities.
