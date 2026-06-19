class K8shh < Formula
  desc "Interactive Kubernetes secret editor (Ink/Yoga TUI)"
  homepage "https://github.com/qw3r/k8shh"
  url "https://github.com/qw3r/k8shh/releases/download/v0.2.0/k8shh-0.2.0.tar.gz"
  sha256 "05f3646b264bdec03dd2fec11ed233cdc9675bc8a2cc19f41087f1ef88f5c644"
  license "MIT"
  version "0.2.0"

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
