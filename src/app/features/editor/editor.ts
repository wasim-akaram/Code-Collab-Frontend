import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FileService, CodeFile } from '../../core/services/file';
import { ProjectService, ProjectMember, Project } from '../../core/services/project';
import { ExecutionService, ExecutionJob } from '../../core/services/execution';
import { CommentService, CommentItem } from '../../core/services/comment';
import { VersionService, SnapshotItem } from '../../core/services/version';
import { CollabService, CollabSession, CollabParticipant } from '../../core/services/collab';
import { AuthService } from '../../core/services/auth';
import { MonacoEditorComponent } from '../../shared/monaco-editor/monaco-editor.component';
import { Subscription, Subject, debounceTime, switchMap, of, catchError } from 'rxjs';

@Component({
 selector: 'app-editor',
 standalone: true,
 imports: [CommonModule, RouterLink, FormsModule, MonacoEditorComponent],
 templateUrl: './editor.html',
 styleUrls: ['./editor.css']
})
export class Editor implements OnInit, OnDestroy {
 private route = inject(ActivatedRoute);
 private fileService = inject(FileService);
 private projectService = inject(ProjectService);
 private executionService = inject(ExecutionService);
 private commentService = inject(CommentService);
 private versionService = inject(VersionService);
 private collabService = inject(CollabService);
 private authService = inject(AuthService);
 private cdr = inject(ChangeDetectorRef);
 private ngZone = inject(NgZone);

 projectId!: number;
 projectName = 'Project Workspace';
 currentUserEmail = '';
 projectOwnerEmail = '';
 canEditProject = false;
 files: CodeFile[] = [];
 expandedFolders = new Set<string>();
 activeFile: CodeFile | null = null;
 codeContent = '';
 isSaving = false;
 saveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';

 // Terminal output
 terminalOutput: string[] = ['CodeSync Terminal v1.0.0', 'Ready.'];

 // Execution state
 isRunning = false;
 currentJobId: string | null = null;
 private pollTimer: any = null;
 stdinInput = '';

 // Dialog state
 showCreateDialog = false;
 createType: 'file' | 'folder' = 'file';
 newItemName = '';
 createError = '';
 createParentPath = ''; // folder context for file creation

 // Rename state
 renamingFileId: number | null = null;
 renameValue = '';

 // Context menu
 contextMenuFileId: number | null = null;

 // Comment panel
 showCommentPanel = false;
 comments: CommentItem[] = [];
 newCommentText = '';
 newCommentLine: number | null = null;
 isLoadingComments = false;

 // ─── Collaboration state ────────────────────────────────────────────────────────
 showCollabPanel = false;
 activeSession: CollabSession | null = null;
 participants: CollabParticipant[] = [];
 isSessionHost = false;
 wsConnected = false;
 private collabSyncTimer: any = null; // polling fallback timer

 // Start session form
 newSessionMaxParticipants = 10;
 newSessionPasswordProtected = false;
 newSessionPassword = '';
 isStartingSession = false;
 collabError = '';

 // Join session form
 joinSessionId = '';
 joinPassword = '';
 joinNeedsPassword = false;
 isJoiningSession = false;

 private wsSubscriptions: Subscription[] = [];
 // ─────────────────────────────────────────────────────────────────────────

 // ─── Version / History panel ─────────────────────────────────────────────
 showHistoryPanel = false;
 snapshots: SnapshotItem[] = [];
 isLoadingHistory = false;
 commitMessage = '';
 selectedDiff = '';
 viewingSnapshot: SnapshotItem | null = null;

 /** Available branches for the active project. */
 branches: string[] = ['main'];
 /** Currently selected branch in the history panel. */
 activeBranch = 'main';

 /** Inline tag editing — maps snapshotId input value. */
 tagInputs: Record<number, string> = {};
 tagEditingId: number | null = null;

 /** Branch creation dialog. */
 showBranchDialog = false;
 newBranchName = '';
 branchError = '';
 isCreatingBranch = false;

 // ─── File Search ──────────────────────────────────────────────────────────
 fileSearchQuery = '';
 fileSearchResults: CodeFile[] | null = null; // null = not searching, [] = no results
 private fileSearchSubject = new Subject<string>();

 // ─── Execution History Panel ──────────────────────────────────────────────
 showExecHistoryPanel = false;
 execHistory: ExecutionJob[] = [];
 isLoadingExecHistory = false;
 selectedHistoryJob: ExecutionJob | null = null;

 // ─── Comment Edit ─────────────────────────────────────────────────────────
 editingCommentId: number | null = null;
 editCommentText = '';

 // ─── Members Panel ────────────────────────────────────────────────────────
 showMembersPanel = false;
 members: ProjectMember[] = [];
 isLoadingMembers = false;
 newMemberEmail = '';
 newMemberRole = 'VIEWER';
 isSavingMember = false;
 memberError = '';
 memberSuccess = '';

 // ─── Upload File ──────────────────────────────────────────────────────────
 isUploading = false;
 uploadError = '';
 uploadSuccess = '';

 // ─────────────────────────────────────────────────────────────────────────

 ngOnInit() {
 this.currentUserEmail = this.authService.getCurrentUserEmail();

 this.route.paramMap.subscribe(params => {
 const id = params.get('id');
 if (id) {
 this.projectId = +id;
 this.loadProject();
 this.loadFiles();
 }
 });

 // Debounced file search
 this.fileSearchSubject.pipe(
 debounceTime(300),
 switchMap(query => {
 if (!query.trim()) {
 this.fileSearchResults = null;
 return of(null);
 }
 return this.fileService.searchInProject(this.projectId, query).pipe(
 catchError(() => of([]))
 );
 })
 ).subscribe(results => {
 if (results !== null) this.fileSearchResults = results;
 });
 }

 loadProject() {
 this.projectService.getProject(this.projectId).subscribe({
 next: (p: Project) => {
 this.projectName = p.name || 'Project Workspace';
 this.projectOwnerEmail = p.ownerEmail || '';
 this.recomputeProjectAccess();
 this.projectService.canEditProject(this.projectId).subscribe({
 next: (canEdit) => {
 this.canEditProject = canEdit || this.canEditProject;
 this.cdr.markForCheck();
 },
 error: () => {
 this.recomputeProjectAccess();
 }
 });
 },
 error: () => {}
 });
 }

 loadFiles() {
 this.fileService.getFileTree(this.projectId).subscribe({
 next: (data) => {
 this.files = data;
 if (this.activeFile) {
 const updated = this.files.find(f => f.fileId === this.activeFile?.fileId);
 if (updated) this.activeFile = updated;
 }
 this.cdr.markForCheck();
 },
 error: (err) => {
 console.error('Failed to load files', err);
 this.terminalOutput.push('> Error: Failed to load project files.');
 this.cdr.markForCheck();
 }
 });
 }

 // ─── File Operations ──────────────────────────────────────────────────────

 openFile(file: CodeFile) {
 if (file.isDirectory) {
 // Toggle folder expand/collapse
 const key = file.path || file.name;
 if (this.expandedFolders.has(key)) {
 this.expandedFolders.delete(key);
 } else {
 this.expandedFolders.add(key);
 }
 this.cdr.markForCheck();
 return;
 }
 this.activeFile = file;
 this.contextMenuFileId = null;

 if (file.fileId && file.content === undefined) {
 this.fileService.getFileContent(file.fileId).subscribe({
 next: (f) => {
 this.codeContent = f.content || '';
 file.content = f.content;
 this.cdr.markForCheck();
 },
 error: () => { this.codeContent = ''; this.cdr.markForCheck(); }
 });
 } else {
 this.codeContent = file.content || '';
 this.cdr.markForCheck();
 }
 // Always refresh whichever panels are open so data reflects the newly
 // selected file without requiring a second click.
 this.loadComments();
 if (this.showHistoryPanel) {
 this.loadBranches();
 this.loadHistory();
 }
 }

 onCodeChange(event: Event) {
 if (!this.canEditProject) return;
 const target = event.target as HTMLTextAreaElement;
 this.codeContent = target.value;
 this.saveStatus = 'idle';

 // Broadcast code change to collab session peers via WebSocket
 if (this.activeSession) {
 const email = this.authService.getCurrentUserEmail();
 this.collabService.sendEditDelta(this.activeSession.sessionId, email, this.codeContent);
 }
 }

 /** Called by Monaco Editor when the user edits code. */
 onMonacoChange(newCode: string) {
 if (!this.canEditProject) return;
 this.codeContent = newCode;
 this.saveStatus = 'idle';

 // Broadcast code change to collab session peers via WebSocket
 if (this.activeSession) {
 const email = this.authService.getCurrentUserEmail();
 this.collabService.sendEditDelta(this.activeSession.sessionId, email, this.codeContent);
 }
 }

 /** Maps file extension to Monaco language ID for syntax highlighting. */
 getMonacoLanguage(): string {
 if (!this.activeFile?.name) return 'plaintext';
 const ext = this.activeFile.name.split('.').pop()?.toLowerCase() || '';
 const langMap: Record<string, string> = {
 'java': 'java',
 'py': 'python',
 'js': 'javascript',
 'jsx': 'javascript',
 'ts': 'typescript',
 'tsx': 'typescript',
 'c': 'c',
 'cpp': 'cpp',
 'cc': 'cpp',
 'cxx': 'cpp',
 'h': 'c',
 'hpp': 'cpp',
 'go': 'go',
 'rs': 'rust',
 'rb': 'ruby',
 'php': 'php',
 'html': 'html',
 'htm': 'html',
 'css': 'css',
 'scss': 'scss',
 'less': 'less',
 'json': 'json',
 'xml': 'xml',
 'yaml': 'yaml',
 'yml': 'yaml',
 'md': 'markdown',
 'sql': 'sql',
 'sh': 'shell',
 'bash': 'shell',
 'ps1': 'powershell',
 'bat': 'bat',
 'cmd': 'bat',
 'dockerfile': 'dockerfile',
 'graphql': 'graphql',
 'swift': 'swift',
 'kt': 'kotlin',
 'kts': 'kotlin',
 'dart': 'dart',
 'r': 'r',
 'lua': 'lua',
 'pl': 'perl',
 'ini': 'ini',
 'toml': 'ini',
 'properties': 'ini'
 };
 return langMap[ext] || 'plaintext';
 }

 saveFile() {
 if (!this.activeFile?.fileId || !this.requireEditAccess('save changes to')) return;
 this.isSaving = true;
 this.saveStatus = 'saving';

 this.fileService.updateFileContent(this.activeFile.fileId, this.codeContent).subscribe({
 next: (updated) => {
 this.isSaving = false;
 this.saveStatus = 'saved';
 this.activeFile!.content = this.codeContent;
 this.activeFile!.size = updated.size;
 this.terminalOutput.push(`> Saved ${this.activeFile?.name}`);
 this.cdr.markForCheck();
 setTimeout(() => { if (this.saveStatus === 'saved') { this.saveStatus = 'idle'; this.cdr.markForCheck(); } }, 2500);
 },
 error: (err) => {
 this.isSaving = false;
 this.saveStatus = 'error';
 this.terminalOutput.push(`> Error saving: ${err.error || 'Unknown error'}`);
 this.cdr.markForCheck();
 }
 });
 }

 // ─── Create File/Folder ───────────────────────────────────────────────────

 openCreateDialog(type: 'file' | 'folder', folderPath?: string) {
 if (!this.requireEditAccess('create files in')) return;
 this.createType = type;
 this.newItemName = '';
 this.createError = '';

 // Determine the parent folder context
 if (folderPath !== undefined) {
 // Explicit folder from context menu
 this.createParentPath = folderPath;
 } else {
 // Infer from the currently active/selected file
 this.createParentPath = this.getActiveFolderPath();
 }

 this.showCreateDialog = true;
 }

 /** Creates a file/folder inside a specific folder (called from context menu). */
 createInFolder(type: 'file' | 'folder', folder: CodeFile) {
 this.contextMenuFileId = null;
 const path = folder.path || folder.name;
 // Auto-expand the folder so the new item is visible
 this.expandedFolders.add(path);
 this.openCreateDialog(type, path);
 }

 /** Returns the folder path of the currently selected file/folder. */
 private getActiveFolderPath(): string {
 if (!this.activeFile) return '';
 if (this.activeFile.isDirectory) {
 return this.activeFile.path || this.activeFile.name;
 }
 // Active file is a regular file — use its parent folder
 const filePath = this.activeFile.path || '';
 const lastSlash = filePath.lastIndexOf('/');
 return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
 }

 closeCreateDialog() {
 this.showCreateDialog = false;
 this.newItemName = '';
 this.createError = '';
 this.createParentPath = '';
 }

 submitCreate() {
 if (!this.requireEditAccess('create files in')) return;
 if (!this.newItemName.trim()) {
 this.createError = 'Name cannot be empty.';
 return;
 }

 // Build the full path by combining parent folder + entered name
 const itemName = this.newItemName.trim();
 const fullPath = this.createParentPath
 ? `${this.createParentPath}/${itemName}`
 : itemName;
 const name = itemName.includes('/') ? itemName.substring(itemName.lastIndexOf('/') + 1) : itemName;

 if (this.createType === 'folder') {
 this.fileService.createFolder(this.projectId, fullPath, name).subscribe({
 next: () => {
 this.closeCreateDialog();
 this.loadFiles();
 this.terminalOutput.push(`> Created folder: ${fullPath}`);
 this.cdr.markForCheck();
 },
 error: (err) => { this.createError = err.error || 'Failed to create folder.'; this.cdr.markForCheck(); }
 });
 } else {
 const file: Partial<CodeFile> = {
 projectId: this.projectId,
 name: name,
 path: fullPath,
 content: '',
 isDirectory: false
 };
 this.fileService.createFile(file).subscribe({
 next: (created) => {
 this.closeCreateDialog();
 this.loadFiles();
 this.terminalOutput.push(`> Created file: ${fullPath}`);
 this.cdr.markForCheck();
 setTimeout(() => this.openFile(created), 300);
 },
 error: (err) => {
 if (err?.status === 0) {
 this.createError = 'Cannot connect to file service. Please check that all backend services are running.';
 } else if (typeof err?.error === 'string') {
 this.createError = err.error;
 } else {
 this.createError = err?.error?.message || err?.message || 'Failed to create file.';
 }
 this.cdr.markForCheck();
 }
 });
 }
 }

 // ─── Upload File ──────────────────────────────────────────────────────────

 /** Programmatically click the hidden file input to open the OS file picker. */
 triggerUpload() {
 if (!this.requireEditAccess('upload files to')) return;
 const input = document.getElementById('file-upload-input') as HTMLInputElement;
 if (input) { input.value = ''; input.click(); }
 }

 /** Called when the user selects a file from the OS picker. */
 handleFileUpload(event: Event) {
 if (!this.requireEditAccess('upload files to')) return;
 const input = event.target as HTMLInputElement;
 if (!input.files || input.files.length === 0) return;

 const file = input.files[0];
 this.isUploading = true;
 this.uploadError = '';
 this.uploadSuccess = '';

 // Determine target directory: use the folder itself, or the parent dir of the active file
 let targetPath = '';
 if (this.activeFile?.path) {
 if (this.activeFile.isDirectory) {
 targetPath = this.activeFile.path;
 } else {
 const lastSlash = this.activeFile.path.lastIndexOf('/');
 targetPath = lastSlash > 0 ? this.activeFile.path.substring(0, lastSlash) : '';
 }
 }

 this.fileService.uploadFile(this.projectId, targetPath, file).subscribe({
 next: (created) => {
 this.isUploading = false;
 this.uploadSuccess = `"${file.name}" uploaded successfully!`;
 this.terminalOutput.push(`> Uploaded: ${file.name}`);
 this.loadFiles();
 this.cdr.markForCheck();
 setTimeout(() => {
 this.openFile(created);
 this.uploadSuccess = '';
 this.cdr.markForCheck();
 }, 500);
 },
 error: (err) => {
 this.isUploading = false;
 this.uploadError = err?.error?.message || err?.error || `Failed to upload "${file.name}".`;
 this.cdr.markForCheck();
 }
 });
 }


 startRename(file: CodeFile) {
 if (!this.requireEditAccess('rename files in')) return;
 this.renamingFileId = file.fileId!;
 this.renameValue = file.name;
 this.contextMenuFileId = null;
 }

 submitRename(file: CodeFile) {
 if (!this.requireEditAccess('rename files in')) return;
 if (!this.renameValue.trim() || this.renameValue === file.name) {
 this.renamingFileId = null;
 return;
 }

 this.fileService.renameFile(file.fileId!, this.renameValue.trim()).subscribe({
 next: () => {
 this.renamingFileId = null;
 this.loadFiles();
 this.terminalOutput.push(`> Renamed ${file.name} ${this.renameValue}`);
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.terminalOutput.push(`> Rename failed: ${err.error || 'Unknown error'}`);
 this.renamingFileId = null;
 this.cdr.markForCheck();
 }
 });
 }

 cancelRename() {
 this.renamingFileId = null;
 }

 // ─── Delete ───────────────────────────────────────────────────────────────

 deleteFileAction(file: CodeFile) {
 if (!this.requireEditAccess('delete files from')) return;
 this.contextMenuFileId = null;
 if (!confirm(`Delete "${file.name}"? This can be restored later.`)) return;

 this.fileService.deleteFile(file.fileId!).subscribe({
 next: () => {
 if (this.activeFile?.fileId === file.fileId) {
 this.activeFile = null;
 this.codeContent = '';
 }
 this.loadFiles();
 this.terminalOutput.push(`> Deleted ${file.name}`);
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.terminalOutput.push(`> Delete failed: ${err.error || 'Unknown error'}`);
 this.cdr.markForCheck();
 }
 });
 }

 // ─── Context Menu ─────────────────────────────────────────────────────────

 toggleContextMenu(event: Event, file: CodeFile) {
 event.stopPropagation();
 this.contextMenuFileId = this.contextMenuFileId === file.fileId ? null : file.fileId!;
 }

 closeContextMenu() {
 this.contextMenuFileId = null;
 }

 // ─── Terminal & Execution ─────────────────────────────────────────────────

 runCode() {
 if (!this.activeFile) return;

 // If another execution is in progress, cancel its polling first
 if (this.isRunning) {
 this.stopCurrentExecution('Interrupted — running new file...');
 }

 this.runSpecificFile(this.activeFile, this.codeContent);
 }

 runFile(file: CodeFile, event?: MouseEvent) {
 event?.preventDefault();
 event?.stopPropagation();

 if (file.isDirectory || !file.fileId) return;

 // If another execution is in progress, cancel its polling first
 if (this.isRunning) {
 this.stopCurrentExecution(`Interrupted — switching to ${file.name}...`);
 }

 this.activeFile = file;
 this.contextMenuFileId = null;

 if (file.content !== undefined) {
 this.codeContent = file.content;
 this.runSpecificFile(file, file.content || '');
 return;
 }

 this.fileService.getFileContent(file.fileId).subscribe({
 next: (freshFile) => {
 const sourceCode = freshFile.content || '';
 file.content = sourceCode;
 this.codeContent = sourceCode;
 this.runSpecificFile(file, sourceCode);
 this.cdr.markForCheck();
 },
 error: () => {
 this.terminalOutput.push(`> Error: Failed to load ${file.name} before execution.`);
 this.cdr.markForCheck();
 }
 });
 }

 /**
 * Stops any in-progress execution tracking (poll timer + state flags).
 * The backend job may continue, but the frontend stops watching it.
 */
 private stopCurrentExecution(reason: string) {
 if (this.pollTimer) {
 clearInterval(this.pollTimer);
 this.pollTimer = null;
 }
 if (this.currentJobId) {
 // Fire-and-forget cancel — don't wait for it
 this.executionService.cancelExecution(this.currentJobId).subscribe({ error: () => {} });
 }
 this.isRunning = false;
 this.currentJobId = null;
 this.terminalOutput.push(`> ${reason}`);
 }

 private runSpecificFile(file: CodeFile, sourceCode: string) {
 const language = this.detectLanguageFromFile(file);
 if (!language) {
 this.terminalOutput.push('> Error: Cannot determine language for this file.');
 return;
 }

 this.isRunning = true;
 this.terminalOutput.push(`> Running ${file.name} (${language})...`);

 this.executionService.submitExecution({
 projectId: this.projectId,
 fileId: file.fileId,
 language: language,
 sourceCode: sourceCode,
 fileName: file.name,
 stdin: this.stdinInput || undefined
 }).subscribe({
 next: (job) => {
 this.currentJobId = job.jobId;
 this.terminalOutput.push(`> Job queued: ${job.jobId.substring(0, 8)}...`);
 this.pollForResult(job.jobId);
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.isRunning = false;
 this.terminalOutput.push(`> Error: ${err.error?.message || err.error || 'Failed to submit execution'}`);
 this.cdr.markForCheck();
 }
 });
 }

 private pollForResult(jobId: string) {
 // Run inside NgZone so setInterval callbacks trigger Angular 21 change detection
 this.ngZone.run(() => {
 this.pollTimer = setInterval(() => {
 this.executionService.getJobById(jobId).subscribe({
 next: (job) => {
 if (job.status === 'COMPLETED' || job.status === 'FAILED' ||
 job.status === 'CANCELLED' || job.status === 'TIMED_OUT') {
 clearInterval(this.pollTimer);
 this.pollTimer = null;
 this.isRunning = false;
 this.currentJobId = null;
 this.displayResult(job);
 this.cdr.markForCheck();
 }
 },
 error: () => {
 clearInterval(this.pollTimer);
 this.pollTimer = null;
 this.isRunning = false;
 this.currentJobId = null;
 this.terminalOutput.push('> Error: Lost connection to execution service.');
 this.cdr.markForCheck();
 }
 });
 }, 1500);
 });
 }

 private displayResult(job: ExecutionJob) {
 this.terminalOutput.push('─'.repeat(40));
 if (job.status === 'TIMED_OUT') {
 this.terminalOutput.push(' Execution timed out after 30 seconds.');
 }
 if (job.stdout && job.stdout.trim()) {
 job.stdout.split('\n').forEach(line => this.terminalOutput.push(line));
 }
 if (job.stderr && job.stderr.trim()) {
 this.terminalOutput.push('--- stderr ---');
 job.stderr.split('\n').forEach(line => this.terminalOutput.push(` ${line}`));
 }
 const exitIcon = job.status === 'TIMED_OUT' ? '[TIMEOUT]' : (job.exitCode === 0 ? '[OK]' : '[ERR]');
 const timeStr = job.executionTimeMs ? ` in ${job.executionTimeMs}ms` : '';
 const statusLabel = job.status === 'TIMED_OUT' ? 'TIMED OUT' : `exited with code ${job.exitCode ?? 'unknown'}`;
 this.terminalOutput.push(`${exitIcon} Process ${statusLabel}${timeStr}`);
 this.terminalOutput.push('─'.repeat(40));
 this.cdr.markForCheck();
 }

 cancelExecution() {
 if (this.currentJobId) {
 this.executionService.cancelExecution(this.currentJobId).subscribe({
 next: () => {
 this.terminalOutput.push('> Execution cancelled.');
 this.isRunning = false;
 if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
 this.currentJobId = null;
 this.cdr.markForCheck();
 },
 error: () => { this.terminalOutput.push('> Failed to cancel execution.'); this.cdr.markForCheck(); }
 });
 }
 }

 clearTerminal() {
 this.terminalOutput = ['CodeSync Terminal v1.0.0', 'Ready.'];
 this.cdr.markForCheck();
 }

 private detectLanguageFromFile(file: CodeFile): string | null {
 const ext = file.name?.split('.').pop()?.toLowerCase();
 const langMap: Record<string, string> = {
 'java': 'java', 'py': 'python', 'js': 'javascript', 'ts': 'typescript',
 'c': 'c', 'cpp': 'cpp', 'go': 'go', 'rs': 'rust',
 'rb': 'ruby', 'php': 'php'
 };
 return ext ? langMap[ext] || null : null;
 }

 // ─── Comments ──────────────────────────────────────────────────────────────

 toggleCommentPanel() {
 this.showCommentPanel = !this.showCommentPanel;
 if (this.showCommentPanel && this.activeFile) {
 this.loadComments();
 }
 }

 loadComments() {
 if (!this.activeFile?.fileId) return;
 this.isLoadingComments = true;
 this.commentService.getCommentsByFile(this.activeFile.fileId).subscribe({
 next: (comments) => {
 this.comments = comments.map(c => ({ ...c, replies: [], showReplies: false, replyText: '' }));
 this.isLoadingComments = false;
 this.cdr.markForCheck();
 },
 error: () => {
 this.comments = [];
 this.isLoadingComments = false;
 this.cdr.markForCheck();
 }
 });
 }

 addComment() {
 if (!this.newCommentText.trim() || !this.activeFile?.fileId) return;
 this.commentService.addComment({
 projectId: this.projectId,
 fileId: this.activeFile.fileId,
 content: this.newCommentText.trim(),
 lineNumber: this.newCommentLine ?? undefined
 }).subscribe({
 next: () => {
 this.newCommentText = '';
 this.newCommentLine = null;
 this.loadComments();
 this.cdr.markForCheck();
 },
 error: (err) => { this.terminalOutput.push(`> Comment error: ${err.error || 'Failed'}`); this.cdr.markForCheck(); }
 });
 }

 deleteComment(commentId: number) {
 if (!confirm('Delete this comment?')) return;
 this.commentService.deleteComment(commentId).subscribe({
 next: () => { this.loadComments(); this.cdr.markForCheck(); },
 error: (err) => { this.terminalOutput.push(`> Delete error: ${err.error || 'Failed'}`); this.cdr.markForCheck(); }
 });
 }

 resolveComment(comment: CommentItem) {
 const action = comment.resolved
 ? this.commentService.unresolveComment(comment.commentId)
 : this.commentService.resolveComment(comment.commentId);
 action.subscribe({
 next: () => { this.loadComments(); this.cdr.markForCheck(); },
 error: (err) => { this.terminalOutput.push(`> Resolve error: ${err.error || 'Failed'}`); this.cdr.markForCheck(); }
 });
 }

 toggleReplies(comment: CommentItem) {
 comment.showReplies = !comment.showReplies;
 if (comment.showReplies && (!comment.replies || comment.replies.length === 0)) {
 this.commentService.getReplies(comment.commentId).subscribe({
 next: (replies) => { comment.replies = replies; this.cdr.markForCheck(); },
 error: () => { comment.replies = []; this.cdr.markForCheck(); }
 });
 }
 }

 addReply(comment: CommentItem) {
 if (!comment.replyText?.trim() || !this.activeFile?.fileId) return;
 this.commentService.addComment({
 projectId: this.projectId,
 fileId: this.activeFile.fileId,
 content: comment.replyText.trim(),
 parentCommentId: comment.commentId,
 lineNumber: comment.lineNumber
 }).subscribe({
 next: () => {
 comment.replyText = '';
 this.commentService.getReplies(comment.commentId).subscribe({
 next: (replies) => { comment.replies = replies; this.cdr.markForCheck(); }
 });
 this.cdr.markForCheck();
 },
 error: (err) => { this.terminalOutput.push(`> Reply error: ${err.error || 'Failed'}`); this.cdr.markForCheck(); }
 });
 }

 getCommentTimeAgo(dateStr?: string): string {
 if (!dateStr) return '';
 const diff = Date.now() - new Date(dateStr).getTime();
 const mins = Math.floor(diff / 60000);
 if (mins < 1) return 'just now';
 if (mins < 60) return `${mins}m ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `${hrs}h ago`;
 return `${Math.floor(hrs / 24)}d ago`;
 }

 getAuthorName(email?: string): string {
 if (!email) return 'Anonymous';
 return email.split('@')[0];
 }

 // ─── Version History ──────────────────────────────────────────────────────

 toggleHistoryPanel() {
 this.showHistoryPanel = !this.showHistoryPanel;
 if (this.showHistoryPanel) {
 this.showCommentPanel = false;
 if (this.activeFile) {
 this.loadBranches();
 this.loadHistory();
 }
 }
 this.selectedDiff = '';
 this.viewingSnapshot = null;
 }

 /** Load all branch names for this project, then load history for activeBranch. */
 loadBranches() {
 this.versionService.getBranches(this.projectId).subscribe({
 next: (branches) => {
 this.branches = branches.length ? branches : ['main'];
 if (!this.branches.includes(this.activeBranch)) {
 this.activeBranch = this.branches[0];
 }
 this.cdr.markForCheck();
 },
 error: () => {
 this.branches = ['main'];
 this.cdr.markForCheck();
 }
 });
 }

 /** Switch to a different branch and reload history. */
 switchBranch(branch: string) {
 this.activeBranch = branch;
 this.selectedDiff = '';
 this.viewingSnapshot = null;
 this.loadHistory();
 }

 loadHistory() {
 if (!this.activeFile?.fileId) {
 this.isLoadingHistory = false;
 this.snapshots = [];
 return;
 }
 this.isLoadingHistory = true;
 this.versionService.getFileHistory(this.activeFile.fileId, this.activeBranch).subscribe({
 next: (snapshots) => {
 this.snapshots = snapshots;
 this.isLoadingHistory = false;
 this.cdr.markForCheck();
 },
 error: () => {
 this.snapshots = [];
 this.isLoadingHistory = false;
 this.cdr.markForCheck();
 }
 });
 }

 createSnapshot() {
 if (!this.activeFile?.fileId || !this.codeContent || !this.requireEditAccess('create snapshots for')) return;
 const msg = this.commitMessage.trim() || `Snapshot of ${this.activeFile.name}`;
 this.versionService.createSnapshot({
 projectId: this.projectId,
 fileId: this.activeFile.fileId,
 content: this.codeContent,
 commitMessage: msg,
 branchName: this.activeBranch
 }).subscribe({
 next: () => {
 this.commitMessage = '';
 this.loadHistory();
 this.terminalOutput.push(`> Snapshot created: "${msg}" on branch '${this.activeBranch}'`);
 this.cdr.markForCheck();
 },
 error: (err) => { this.terminalOutput.push(`> Snapshot error: ${err.error?.message || 'Failed'}`); this.cdr.markForCheck(); }
 });
 }

 viewSnapshotDiff(snapshot: SnapshotItem, index: number) {
 this.viewingSnapshot = snapshot;
 if (index < this.snapshots.length - 1) {
 const older = this.snapshots[index + 1];
 this.versionService.getDiff(older.snapshotId, snapshot.snapshotId).subscribe({
 next: (result) => { this.selectedDiff = result.diff || '(No changes)'; this.cdr.markForCheck(); },
 error: () => { this.selectedDiff = '(Failed to load diff)'; this.cdr.markForCheck(); }
 });
 } else {
 this.selectedDiff = '(Initial snapshot — no previous version to compare)';
 }
 }

 /**
 * Non-destructive restore: calls the backend which creates a NEW snapshot
 * with the old content, then reloads the history.
 */
 restoreSnapshot(snapshot: SnapshotItem) {
 if (!this.requireEditAccess('restore snapshots in')) return;
 if (!confirm(`Restore to snapshot "${snapshot.commitMessage || '#' + snapshot.snapshotId}"?\n\nA new snapshot will be created with this content — nothing is deleted.`)) return;

 this.versionService.restoreSnapshot(snapshot.snapshotId).subscribe({
 next: (newSnap) => {
 this.codeContent = newSnap.content;
 if (this.activeFile) this.activeFile.content = newSnap.content;
 this.loadHistory();
 this.terminalOutput.push(`> Restored from snapshot #${snapshot.snapshotId} new snapshot #${newSnap.snapshotId}`);
 this.cdr.markForCheck();
 },
 error: (err) => { this.terminalOutput.push(`> Restore failed: ${err.error?.message || 'Unknown error'}`); this.cdr.markForCheck(); }
 });
 }

 closeDiffView() {
 this.selectedDiff = '';
 this.viewingSnapshot = null;
 }

 // ─── Inline Tag ───────────────────────────────────────────────────────────

 startTagEdit(snap: SnapshotItem) {
 this.tagEditingId = snap.snapshotId;
 this.tagInputs[snap.snapshotId] = snap.tag || '';
 }

 cancelTagEdit() {
 this.tagEditingId = null;
 }

 submitTag(snap: SnapshotItem) {
 if (!this.requireEditAccess('tag snapshots in')) return;
 const tag = (this.tagInputs[snap.snapshotId] || '').trim();
 if (!tag) { this.tagEditingId = null; return; }
 this.versionService.tagSnapshot(snap.snapshotId, tag).subscribe({
 next: (updated) => {
 snap.tag = updated.tag;
 this.tagEditingId = null;
 this.terminalOutput.push(`> Tagged snapshot #${snap.snapshotId} as "${tag}"`);
 this.cdr.markForCheck();
 },
 error: () => { this.terminalOutput.push('> Failed to save tag.'); this.cdr.markForCheck(); }
 });
 }

 // ─── Branch Management ────────────────────────────────────────────────────

 openBranchDialog() {
 if (!this.requireEditAccess('create branches in')) return;
 this.newBranchName = '';
 this.branchError = '';
 this.showBranchDialog = true;
 }

 closeBranchDialog() {
 this.showBranchDialog = false;
 this.newBranchName = '';
 this.branchError = '';
 }

 submitCreateBranch() {
 if (!this.requireEditAccess('create branches in')) return;
 const name = this.newBranchName.trim();
 if (!name) { this.branchError = 'Branch name cannot be empty.'; return; }
 if (!this.activeFile?.fileId) { this.branchError = 'No file selected.'; return; }
 if (this.branches.includes(name)) { this.branchError = `Branch "${name}" already exists.`; return; }

 this.isCreatingBranch = true;
 this.versionService.createBranch({
 fileId: this.activeFile.fileId,
 sourceBranch: this.activeBranch,
 newBranch: name
 }).subscribe({
 next: () => {
 this.isCreatingBranch = false;
 this.terminalOutput.push(`> Branch "${name}" created from "${this.activeBranch}"`);
 this.closeBranchDialog();
 this.loadBranches();
 this.switchBranch(name);
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.isCreatingBranch = false;
 this.branchError = err.error?.message || 'Failed to create branch.';
 this.cdr.markForCheck();
 }
 });
 }

 // ─── Collaboration ────────────────────────────────────────────────────────

 toggleCollabPanel() {
 this.showCollabPanel = !this.showCollabPanel;
 if (this.showCollabPanel) {
 this.showCommentPanel = false;
 this.showHistoryPanel = false;
 if (this.activeSession) this.refreshParticipants();
 }
 }

 startCollabSession() {
 if (!this.activeFile?.fileId) {
 this.collabError = 'Please open a file first.';
 return;
 }
 this.isStartingSession = true;
 this.collabError = '';

 this.collabService.createSession({
 projectId: this.projectId,
 fileId: this.activeFile.fileId,
 language: this.detectLanguageFromFile(this.activeFile) || undefined,
 maxParticipants: this.newSessionMaxParticipants,
 isPasswordProtected: this.newSessionPasswordProtected,
 sessionPassword: this.newSessionPasswordProtected ? this.newSessionPassword : undefined
 }).subscribe({
 next: (session) => {
 this.activeSession = session;
 this.isStartingSession = false;
 this.isSessionHost = true;
 this.connectWebSocket(session.sessionId);
 this.refreshParticipants();
 this.terminalOutput.push(`> Collab session started: ${session.sessionId.substring(0, 8)}...`);
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.isStartingSession = false;
 this.collabError = typeof err?.error === 'string' ? err.error
 : err?.error?.message || 'Failed to start session.';
 this.cdr.markForCheck();
 }
 });
 }

 joinCollabSession() {
 if (!this.joinSessionId.trim()) return;
 this.isJoiningSession = true;
 this.collabError = '';

 const password = this.joinNeedsPassword ? this.joinPassword : undefined;
 this.collabService.joinSession(this.joinSessionId.trim(), password).subscribe({
 next: (participant) => {
 this.isSessionHost = participant.role === 'HOST';
 // Load session details
 this.collabService.getSession(this.joinSessionId.trim()).subscribe({
 next: (session) => {
 this.activeSession = session;
 this.isJoiningSession = false;
 this.connectWebSocket(session.sessionId);
 this.refreshParticipants();
 this.cdr.markForCheck();
 this.terminalOutput.push(`> Joined session: ${session.sessionId.substring(0, 8)}...`);

 // Auto-load the file being collaborated on so this user sees the right content
 if (session.fileId) {
 this.fileService.getFileContent(session.fileId).subscribe({
 next: (f) => {
 this.activeFile = f;
 this.codeContent = f.content || '';
 this.cdr.markForCheck();
 this.terminalOutput.push(`> Loaded collab file: ${f.name}`);
 },
 error: () => {
 this.terminalOutput.push('> Could not auto-load the session file. Open it manually from the explorer.');
 }
 });
 }
 },
 error: () => { this.isJoiningSession = false; this.cdr.markForCheck(); }
 });
 },
 error: (err) => {
 this.isJoiningSession = false;
 const msg = err.error?.message || err.error || '';
 if (msg.toLowerCase().includes('password')) {
 this.joinNeedsPassword = true;
 this.collabError = 'This session is password protected. Enter the password above.';
 } else {
 this.collabError = msg || 'Failed to join session.';
 }
 this.cdr.markForCheck();
 }
 });
 }

 leaveCollabSession() {
 if (!this.activeSession) return;
 this.collabService.leaveSession(this.activeSession.sessionId).subscribe({
 next: () => {
 this.announceLeaveViaWs();
 this.cleanupSession();
 this.terminalOutput.push('> Left collab session.');
 },
 error: () => this.cleanupSession()
 });
 }

 endCollabSession() {
 if (!this.activeSession || !confirm('End this session for all participants?')) return;
 this.collabService.endSession(this.activeSession.sessionId).subscribe({
 next: () => {
 this.cleanupSession();
 this.terminalOutput.push('> Collab session ended.');
 },
 error: (err) => this.terminalOutput.push(`> End session error: ${err.error?.message || 'Failed'}`)
 });
 }

 kickParticipant(targetEmail: string) {
 if (!this.activeSession) return;
 if (!confirm(`Kick ${targetEmail} from session?`)) return;
 this.collabService.kickParticipant(this.activeSession.sessionId, targetEmail).subscribe({
 next: () => {
 this.terminalOutput.push(`> Kicked ${targetEmail}`);
 this.refreshParticipants();
 },
 error: (err) => this.terminalOutput.push(`> Kick failed: ${err.error?.message || 'Error'}`)
 });
 }

 refreshParticipants() {
 if (!this.activeSession) return;
 this.collabService.getParticipants(this.activeSession.sessionId).subscribe({
 next: (list) => { this.participants = list; this.cdr.markForCheck(); },
 error: () => {}
 });
 }

 copySessionId() {
 if (!this.activeSession) return;
 navigator.clipboard.writeText(this.activeSession.sessionId)
 .then(() => this.terminalOutput.push('> Session ID copied to clipboard.'))
 .catch(() => {});
 }

 private connectWebSocket(sessionId: string) {
 this.collabService.connectToSession(sessionId);

 // Connection state
 const connSub = this.collabService.connectionState$.subscribe(state => {
 this.wsConnected = state === 'connected';
 this.cdr.markForCheck();

 if (state === 'connected') {
 // Stop polling fallback — WS is live
 this.stopCollabPolling();
 const currentUser = this.authService.getCurrentUserEmail();
 const color = this.participants.find(p => p.userEmail === currentUser)?.color || '#FF5733';
 this.collabService.announceJoin(sessionId, currentUser, color);
 } else {
 // WS not available — start polling fallback to keep content in sync
 this.startCollabPolling(sessionId);
 }
 });

 // Listen for others' edits — apply and trigger change detection
 const editSub = this.collabService.editEvents$.subscribe(event => {
 const currentUser = this.authService.getCurrentUserEmail();
 if (event.userEmail !== currentUser && event.content !== undefined) {
 this.codeContent = event.content;
 this.cdr.markForCheck();
 }
 });

 // Listen for participant roster changes
 const pSub = this.collabService.participantEvents$.subscribe(() => {
 this.refreshParticipants();
 this.cdr.markForCheck();
 });

 this.wsSubscriptions = [connSub, editSub, pSub];

 // Start polling immediately as a fallback while WS handshake is pending
 this.startCollabPolling(sessionId);
 }

 /**
 * Polling fallback: reads the current file content from DB every 3 seconds.
 * Ensures both users see the same content even when WebSocket is unavailable.
 * Stops automatically when WS connects.
 */
 private startCollabPolling(sessionId: string) {
 if (this.collabSyncTimer) return; // already polling
 this.collabSyncTimer = this.ngZone.run(() =>
 setInterval(() => {
 if (!this.activeFile?.fileId) return;
 this.fileService.getFileContent(this.activeFile.fileId).subscribe({
 next: (f) => {
 const remote = f.content || '';
 // Only update if content actually changed to avoid cursor disruption
 if (remote !== this.codeContent) {
 this.codeContent = remote;
 this.cdr.markForCheck();
 }
 },
 error: () => {}
 });
 }, 3000)
 );
 }

 private stopCollabPolling() {
 if (this.collabSyncTimer) {
 clearInterval(this.collabSyncTimer);
 this.collabSyncTimer = null;
 }
 }


 private announceLeaveViaWs() {
 if (!this.activeSession) return;
 const email = this.authService.getCurrentUserEmail();
 this.collabService.announceLeave(this.activeSession.sessionId, email);
 }

 private cleanupSession() {
 this.stopCollabPolling();
 this.collabService.disconnectFromSession();
 this.wsSubscriptions.forEach(s => s.unsubscribe());
 this.wsSubscriptions = [];
 this.activeSession = null;
 this.participants = [];
 this.isSessionHost = false;
 this.wsConnected = false;
 this.joinSessionId = '';
 this.joinPassword = '';
 this.joinNeedsPassword = false;
 this.cdr.markForCheck();
 }

 // ─── File Search ──────────────────────────────────────────────────────────

 onFileSearch(query: string) {
 this.fileSearchQuery = query;
 this.fileSearchSubject.next(query);
 }

 clearFileSearch() {
 this.fileSearchQuery = '';
 this.fileSearchResults = null;
 this.fileSearchSubject.next('');
 }

 get displayedFiles(): CodeFile[] {
 const source = this.fileSearchResults !== null ? this.fileSearchResults : this.files;
 // When showing the full tree (not search results), respect folder expand/collapse
 if (this.fileSearchResults !== null) return source;
 return source.filter(file => {
 // Root-level items are always visible
 const path = file.path || '';
 const lastSlash = path.lastIndexOf('/');
 if (lastSlash <= 0) return true; // root-level or top-level path like "/file"
 // Check all ancestor folders are expanded
 const parts = path.split('/').filter(Boolean);
 // Build parent paths and check each is expanded
 let current = '';
 for (let i = 0; i < parts.length - 1; i++) {
 current = current ? current + '/' + parts[i] : parts[i];
 // Check both with and without leading slash
 if (!this.expandedFolders.has(current) && !this.expandedFolders.has('/' + current)) {
 return false;
 }
 }
 return true;
 });
 }

 // ─── Execution History Panel ──────────────────────────────────────────────

 toggleExecHistoryPanel() {
 this.showExecHistoryPanel = !this.showExecHistoryPanel;
 if (this.showExecHistoryPanel && this.execHistory.length === 0) {
 this.loadExecHistory();
 }
 }

 loadExecHistory() {
 this.isLoadingExecHistory = true;
 this.executionService.getExecutionsByProject(this.projectId).subscribe({
 next: (jobs) => {
 this.execHistory = jobs.sort((a, b) =>
 new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
 );
 this.isLoadingExecHistory = false;
 this.cdr.markForCheck();
 },
 error: () => { this.isLoadingExecHistory = false; this.cdr.markForCheck(); }
 });
 }

 viewHistoryJob(job: ExecutionJob) {
 this.selectedHistoryJob = job;
 this.terminalOutput.push('─'.repeat(40));
 this.terminalOutput.push(`> History: ${job.language} · ${job.status} · ${this.formatExecTime(job.createdAt)}`);
 if (job.stdout?.trim()) {
 job.stdout.split('\n').forEach(line => this.terminalOutput.push(line));
 }
 if (job.stderr?.trim()) {
 this.terminalOutput.push('--- stderr ---');
 job.stderr.split('\n').forEach(line => this.terminalOutput.push(` ${line}`));
 }
 this.terminalOutput.push(`${job.exitCode === 0 ? '[OK]' : '[ERR]'} Exited ${job.exitCode ?? '?'} (${job.executionTimeMs ?? '?'}ms)`);
 this.terminalOutput.push('─'.repeat(40));
 this.cdr.markForCheck();
 }

 formatExecTime(dateStr?: string): string {
 if (!dateStr) return '';
 return new Date(dateStr).toLocaleString();
 }

 getStatusBadgeClass(status: string): string {
 switch (status) {
 case 'COMPLETED': return 'badge-success';
 case 'FAILED': return 'badge-error';
 case 'TIMED_OUT': return 'badge-warning';
 case 'CANCELLED': return 'badge-neutral';
 default: return 'badge-info';
 }
 }

 // ─── Comment Edit ─────────────────────────────────────────────────────────

 startEditComment(comment: CommentItem) {
 this.editingCommentId = comment.commentId;
 this.editCommentText = comment.content;
 }

 cancelEditComment() {
 this.editingCommentId = null;
 this.editCommentText = '';
 }

 saveEditComment(comment: CommentItem) {
 if (!this.editCommentText.trim()) return;
 this.commentService.updateComment(comment.commentId, this.editCommentText.trim()).subscribe({
 next: (updated) => {
 comment.content = updated.content;
 this.editingCommentId = null;
 this.editCommentText = '';
 this.cdr.markForCheck();
 },
 error: (err) => { this.terminalOutput.push(`> Edit failed: ${err.error || 'Error'}`); this.cdr.markForCheck(); }
 });
 }

 // ─── Members Panel ────────────────────────────────────────────────────────

 toggleMembersPanel() {
 this.showMembersPanel = !this.showMembersPanel;
 if (this.showMembersPanel) {
 this.showCommentPanel = false;
 this.showHistoryPanel = false;
 this.showCollabPanel = false;
 this.loadMembers();
 }
 this.memberError = '';
 this.memberSuccess = '';
 }

 loadMembers() {
 this.isLoadingMembers = true;
 this.projectService.getProjectMembers(this.projectId).subscribe({
 next: (res) => {
 this.members = res.content || [];
 this.isLoadingMembers = false;
 this.recomputeProjectAccess();
 this.cdr.markForCheck();
 },
 error: () => {
 this.isLoadingMembers = false;
 this.recomputeProjectAccess();
 this.cdr.markForCheck();
 }
 });
 }

 private recomputeProjectAccess() {
 const currentUser = this.currentUserEmail.trim().toLowerCase();
 const ownerEmail = this.projectOwnerEmail.trim().toLowerCase();
 const isOwner = !!currentUser && ownerEmail === currentUser;
 const isEditor = this.members.some(member => {
 const role = (member.role || '').trim().toUpperCase();
 const memberEmail = (member.userEmail || '').trim().toLowerCase();
 return memberEmail === currentUser && (role === 'EDITOR' || role === 'OWNER');
 });

 this.canEditProject = isOwner || isEditor;
 this.cdr.markForCheck();
 }

 private requireEditAccess(actionLabel: string): boolean {
 if (this.canEditProject) return true;
 this.terminalOutput.push(`> Read-only access: you cannot ${actionLabel} this project.`);
 return false;
 }

 addMember() {
 if (!this.newMemberEmail.trim()) return;
 this.isSavingMember = true;
 this.memberError = '';
 this.memberSuccess = '';
 this.cdr.markForCheck();

 this.projectService.addMember(this.projectId, this.newMemberEmail.trim(), this.newMemberRole).subscribe({
 next: () => {
 this.memberSuccess = `${this.newMemberEmail} added as ${this.newMemberRole}.`;
 this.newMemberEmail = '';
 this.isSavingMember = false;
 this.loadMembers();
 this.cdr.markForCheck();
 },
 error: (err) => {
 this.memberError = this.extractMemberError(err);
 this.isSavingMember = false;
 this.cdr.markForCheck();
 }
 });
 }

 removeMember(email: string) {
 if (!confirm(`Remove ${email} from this project?`)) return;
 this.projectService.removeMember(this.projectId, email).subscribe({
 next: () => {
 this.memberSuccess = `${email} removed.`;
 this.loadMembers();
 this.cdr.markForCheck();
 },
 error: (err) => { this.memberError = this.extractMemberError(err); this.cdr.markForCheck(); }
 });
 }

 private extractMemberError(err: any): string {
 if (typeof err?.error === 'string') return err.error;
 if (typeof err?.error?.message === 'string') return err.error.message;
 if (err?.status === 404) return 'User not found with that email.';
 if (err?.status === 409) return 'User is already a member of this project.';
 if (err?.status === 403) return 'You do not have permission to add members.';
 return 'Failed to update members. Please try again.';
 }

 getMemberRoleClass(role: string): string {
 switch (role) {
 case 'OWNER': return 'role-owner';
 case 'EDITOR': return 'role-editor';
 default: return 'role-viewer';
 }
 }

 // ─── Lifecycle ────────────────────────────────────────────────────────────

 ngOnDestroy() {
 if (this.pollTimer) { clearInterval(this.pollTimer); }
 // Clean up WebSocket collab connection
 if (this.activeSession) {
 this.announceLeaveViaWs();
 }
 this.collabService.disconnectFromSession();
 this.wsSubscriptions.forEach(s => s.unsubscribe());
 }

 // ─── Helpers ──────────────────────────────────────────────────────────────

 getFileIcon(file: CodeFile): string {
 if (file.isDirectory) {
 const key = file.path || file.name;
 return this.expandedFolders.has(key) ? 'fi-folder-open' : 'fi-folder';
 }
 const ext = file.name?.split('.').pop()?.toLowerCase();
 switch (ext) {
 case 'java': return 'fi-java';
 case 'js': case 'jsx': return 'fi-js';
 case 'ts': case 'tsx': return 'fi-ts';
 case 'py': return 'fi-py';
 case 'html': return 'fi-html';
 case 'css': return 'fi-css';
 case 'json': return 'fi-json';
 case 'md': return 'fi-md';
 case 'go': return 'fi-go';
 case 'rs': return 'fi-rs';
 case 'c': case 'cpp': return 'fi-cpp';
 default: return 'fi-file';
 }
 }

 getIndentLevel(file: CodeFile): number {
 if (!file.path) return 0;
 return (file.path.match(/\//g) || []).length;
 }

 handleKeyDown(event: KeyboardEvent) {
 if ((event.ctrlKey || event.metaKey) && event.key === 's') {
 event.preventDefault();
 this.saveFile();
 }
 if (event.key === 'Tab') {
 event.preventDefault();
 const ta = event.target as HTMLTextAreaElement;
 const start = ta.selectionStart;
 const end = ta.selectionEnd;
 this.codeContent = this.codeContent.substring(0, start) + ' ' + this.codeContent.substring(end);
 setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
 }
 }
}
