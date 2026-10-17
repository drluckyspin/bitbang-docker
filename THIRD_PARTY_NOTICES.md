# Third-party notices

bitbang-docker downloads, builds or embeds the software below. Versions are pinned in the `Dockerfile`, `cli/Dockerfile`
and `package.json`. The image records them as `bitbang-docker.version.*` labels, and `make test` checks the installed
versions against them.

| Component                                                              | License                    | How bitbang-docker uses it                                  | License text                          |
| ---------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| [BitBang CLI](https://github.com/richlegrand/bitbang-cli)              | MIT                        | Release binary in the image, checksum-verified              | `third_party/bitbang-cli/LICENSE`     |
| [Herdr](https://github.com/herdrdev/herdr)                             | Apache-2.0                 | Release binary in the image, checksum-verified              | `third_party/herdr/LICENSE`           |
| [herdr-web-ui](https://github.com/devswha/herdr-web-ui)                | MIT                        | Source at a pinned commit, run by Bun in the image          | `third_party/herdr-web-ui/LICENSE`    |
| [Bun](https://bun.sh)                                                  | MIT; JavaScriptCore LGPL-2 | Runtime in the image, and embedded in each `bbd` executable | [Bun's licensing page][bun-licensing] |
| [lean-qr](https://github.com/davidje13/lean-qr)                        | MIT                        | QR codes in `bbd`, compiled into it                         | `third_party/lean-qr/LICENSE`         |
| [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code) | Anthropic's terms          | Installed from npm when the image is built                  | Its npm package                       |
| [Codex CLI](https://github.com/openai/codex)                           | Apache-2.0                 | Installed from npm when the image is built                  | Its npm package                       |
| [uv](https://github.com/astral-sh/uv)                                  | MIT or Apache-2.0          | Copied from its official image                              | Its repository                        |

The image keeps the files under `third_party/` in `/usr/local/share/doc/bitbang-docker/third_party/`. The base image
(`node:24-trixie-slim`) and the Debian packages installed on it carry their own notices in `/usr/share/doc`.

`bbd` is built on your machine and is not distributed. Anyone who redistributes the compiled executables should check
[Bun's licensing page][bun-licensing] for what the statically linked JavaScriptCore requires.

[bun-licensing]: https://bun.sh/docs/project/licensing
