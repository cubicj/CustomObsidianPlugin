const { Plugin, MarkdownView } = require("obsidian");

class NoAutoFocus extends Plugin {
  async onload() {
    // MarkdownView 프로토타입의 setEphemeralState를 1회 패치
    // 모든 마크다운 뷰 인스턴스에 영구 적용 — 타이밍 문제 없음
    this.original = MarkdownView.prototype.setEphemeralState;

    MarkdownView.prototype.setEphemeralState = function(state) {
      return NoAutoFocus._original.call(this, { ...state, focus: false });
    };
    NoAutoFocus._original = this.original;
  }

  onunload() {
    // 플러그인 비활성화 시 원복
    if (this.original) {
      MarkdownView.prototype.setEphemeralState = this.original;
    }
  }
}

module.exports = NoAutoFocus;
