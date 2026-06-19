class GapSecrets < Formula
  desc "Interactive Kubernetes secret editor (Ink/Yoga TUI)"
  homepage "https://github.com/OWNER/REPO"
  url "https://github.com/OWNER/REPO/releases/download/v0.1.0/gap-secrets-0.1.0.tar.gz"
  sha256 "077eb45afa4494a618d6363d6769ac283236653b252ee8d34bdd0f70860c4ead"
  license "MIT"
  version "0.1.0"

  depends_on "node"

  def install
    # The release ships a single self-contained bundle; only Node is required.
    libexec.install "gap-secrets.mjs"
    (bin/"gap-secrets").write <<~SH
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/gap-secrets.mjs" "$@"
    SH
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/gap-secrets --version")
  end
end
