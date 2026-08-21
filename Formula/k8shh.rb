class K8shh < Formula
  desc "Interactive Kubernetes secret editor (Ink/Yoga TUI)"
  homepage "https://github.com/qw3r/k8shh"
  url "https://github.com/qw3r/k8shh/releases/download/v2.0.0/k8shh-2.0.0.tar.gz"
  sha256 "64da123323802ce3045d9e80d239983002de8c83e86f34505f1802d8771d0623"
  license "MIT"
  version "2.0.0"

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
