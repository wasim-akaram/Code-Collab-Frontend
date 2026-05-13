import {
  Component, Input, Output, EventEmitter,
  ElementRef, OnDestroy, OnChanges, SimpleChanges,
  AfterViewInit, NgZone, ViewChild
} from '@angular/core';

// Monaco typings — loaded at runtime from /vs/
declare const monaco: any;

@Component({
  selector: 'app-monaco-editor',
  standalone: true,
  template: `<div #editorContainer class="monaco-container"></div>`,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .monaco-container { width: 100%; height: 100%; }
  `]
})
export class MonacoEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;

  @Input() code = '';
  @Input() language = 'plaintext';
  @Input() readOnly = false;
  @Input() theme = 'vs-dark';

  @Output() codeChange = new EventEmitter<string>();

  private editor: any = null;
  private resizeObserver: ResizeObserver | null = null;
  private ignoreNextChange = false;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    this.loadMonaco();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editor) return;

    if (changes['code'] && !changes['code'].firstChange) {
      const current = this.editor.getValue();
      if (changes['code'].currentValue !== current) {
        this.ignoreNextChange = true;
        this.editor.setValue(changes['code'].currentValue || '');
      }
    }

    if (changes['language'] && !changes['language'].firstChange) {
      const model = this.editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, changes['language'].currentValue || 'plaintext');
      }
    }

    if (changes['readOnly'] && !changes['readOnly'].firstChange) {
      this.editor.updateOptions({ readOnly: changes['readOnly'].currentValue });
    }

    if (changes['theme'] && !changes['theme'].firstChange) {
      monaco.editor.setTheme(changes['theme'].currentValue || 'vs-dark');
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.editor?.dispose();
  }

  private loadMonaco(): void {
    // Monaco is already loaded globally (check if the 'monaco' global exists)
    if (typeof monaco !== 'undefined') {
      this.initEditor();
      return;
    }

    // The AMD loader is added in index.html. Use it to load Monaco.
    const win = window as any;
    if (win.require) {
      win.require(['vs/editor/editor.main'], () => {
        this.zone.run(() => this.initEditor());
      });
    } else {
      // Fallback: wait for loader to be available (retries a few times)
      let attempts = 0;
      const waitForLoader = setInterval(() => {
        attempts++;
        if (typeof monaco !== 'undefined') {
          clearInterval(waitForLoader);
          this.zone.run(() => this.initEditor());
        } else if (win.require) {
          clearInterval(waitForLoader);
          win.require(['vs/editor/editor.main'], () => {
            this.zone.run(() => this.initEditor());
          });
        } else if (attempts > 20) {
          clearInterval(waitForLoader);
          console.error('[Monaco] Failed to load Monaco Editor after 20 attempts');
        }
      }, 250);
    }
  }

  private initEditor(): void {
    this.editor = monaco.editor.create(this.editorContainer.nativeElement, {
      value: this.code || '',
      language: this.language || 'plaintext',
      theme: this.theme || 'vs-dark',
      readOnly: this.readOnly,
      automaticLayout: false,
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      tabSize: 4,
      insertSpaces: true,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      padding: { top: 12, bottom: 12 },
      suggest: { showMethods: true, showFunctions: true },
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false
      }
    });

    // Listen for content changes
    this.editor.onDidChangeModelContent(() => {
      if (this.ignoreNextChange) {
        this.ignoreNextChange = false;
        return;
      }
      const value = this.editor.getValue();
      this.zone.run(() => this.codeChange.emit(value));
    });

    // Use ResizeObserver for responsive layout
    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => this.editor?.layout());
    });
    this.resizeObserver.observe(this.editorContainer.nativeElement);
  }
}
