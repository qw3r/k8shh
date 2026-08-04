class K8shh < Formula
  desc "Interactive Kubernetes secret editor (Ink/Yoga TUI)"
  homepage "https://github.com/qw3r/k8shh"
  url "https://github.com/qw3r/k8shh/releases/download/v1.2.1/k8shh-1.2.1.tar.gz"
  sha256 "f2c4b44c306451e1b26e95b20cd2141c0e4cdfeb02b861a832d440fd2b723690"
  license "MIT"
  version "1.2.1"

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
