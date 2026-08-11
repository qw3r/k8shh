class K8shh < Formula
  desc "Interactive Kubernetes secret editor (Ink/Yoga TUI)"
  homepage "https://github.com/qw3r/k8shh"
  url "https://github.com/qw3r/k8shh/releases/download/v1.3.0/k8shh-1.3.0.tar.gz"
  sha256 "656af2106edff1e04d2863aa5757219a1b6c326486dea9b1b5e6aac5482f2708"
  license "MIT"
  version "1.3.0"

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
