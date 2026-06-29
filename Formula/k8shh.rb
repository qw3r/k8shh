class K8shh < Formula
  desc "Interactive Kubernetes secret editor (Ink/Yoga TUI)"
  homepage "https://github.com/qw3r/k8shh"
  url "https://github.com/qw3r/k8shh/releases/download/v1.1.0/k8shh-1.1.0.tar.gz"
  sha256 "eb30fc7b0d81a95cceb77138de86211aa8a3548fb1c81841aeef075593ec1283"
  license "MIT"
  version "1.1.0"

  depends_on "node"

  def install
    # The release ships a single self-contained bundle; only Node is required.
    libexec.install "k8shh.mjs"
    (bin/"k8shh").write <<~SH
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/k8shh.mjs" "$@"
    SH
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/k8shh --version")
  end
end
