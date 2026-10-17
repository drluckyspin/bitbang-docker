# -----------------------------------------------------------------------------------------------------------
# BitBang Docker — Makefile
# -----------------------------------------------------------------------------------------------------------
# A hardened container around one local git repo, with a tmux shell in it served over BitBang.
#
#   make help                         — list targets
#   make build                        — build the image
#   make run REPO=~/src/my-repo       — start, print the QR code, follow logs (Ctrl+C stops it)
#   make run-detached REPO=...        — start in the background and print the QR code
#   make url / attach / ping / down   — work with running workspaces
# -----------------------------------------------------------------------------------------------------------

include Common.make
