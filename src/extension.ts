import * as vscode from 'vscode';
import { OrbViewProvider } from './OrbViewProvider';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new OrbViewProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(OrbViewProvider.viewType, provider));

    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    let typingIdleTimer: ReturnType<typeof setTimeout> | undefined;
    let errorCount = 0;
    let taskCount = 0;
    let debugCount = 0;
    let inactivityTimer: ReturnType<typeof setTimeout> | undefined;

    const activity = (): void => {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => provider.send({ type: 'sequence', name: 'fall_asleep' }), 120000);
    };

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            activity();
            if (!vscode.workspace.getConfiguration('codeorb').get<boolean>('reactToTyping', true)) {return;}
            if (event.document !== vscode.window.activeTextEditor?.document || event.contentChanges.length === 0) {return;}
            clearTimeout(typingTimer);
            clearTimeout(typingIdleTimer);
            provider.send({ type: 'sequence', name: 'focus' });
            typingTimer = setTimeout(() => provider.send({ type: 'idle' }), 1500);
            typingIdleTimer = setTimeout(() => undefined, 1500);
        }),
        vscode.workspace.onDidSaveTextDocument(() => { activity(); provider.send({ type: 'sequence', name: 'hop' }); }),
        vscode.window.onDidChangeActiveTextEditor(() => { activity(); provider.send({ type: 'sequence', name: Math.random() < .5 ? 'look_around' : 'curious' }); }),
        vscode.window.onDidChangeWindowState(state => {
            if (state.focused) {provider.send({ type: 'sequence', name: 'wake_up' });}
            else {setTimeout(() => {
                if (!vscode.window.state.focused) {provider.send({ type: 'sequence', name: 'fall_asleep' });}
            }, 20000);}
        }),
        vscode.languages.onDidChangeDiagnostics(() => {
            const next = vscode.languages.getDiagnostics().reduce((count, [, diagnostics]) =>
                count + diagnostics.filter(item => item.severity === vscode.DiagnosticSeverity.Error).length, 0);
            if (next > errorCount) {provider.send({ type: 'sequence', name: 'worried' });}
            else if (next === 0 && errorCount > 0) {provider.send({ type: 'sequence', name: 'bounce' });}
            errorCount = next;
        }),
        vscode.tasks.onDidStartTask(() => { taskCount++; provider.send({ type: 'sequence', name: 'loading_pulse' }); }),
        vscode.tasks.onDidEndTask(() => { taskCount = Math.max(0, taskCount - 1); if (taskCount === 0) { provider.send({ type: 'idle' }); provider.send({ type: 'sequence', name: 'celebrate' }); } }),
        vscode.debug.onDidStartDebugSession(() => { debugCount++; provider.send({ type: 'sequence', name: 'loading_pulse' }); }),
        vscode.debug.onDidTerminateDebugSession(() => { debugCount = Math.max(0, debugCount - 1); if (debugCount === 0) { provider.send({ type: 'idle' }); provider.send({ type: 'sequence', name: 'celebrate' }); } }),
        vscode.commands.registerCommand('codeorb.focus', () => vscode.commands.executeCommand('codeorb.orbView.focus')),
        vscode.commands.registerCommand('codeorb.poke', () => provider.send({ type: 'sequence', name: 'poke' })),
        vscode.commands.registerCommand('codeorb.sleep', () => provider.send({ type: 'sequence', name: 'fall_asleep' })),
        vscode.commands.registerCommand('codeorb.wake', () => provider.send({ type: 'sequence', name: 'wake_up' })),
        vscode.commands.registerCommand('codeorb.celebrate', () => provider.send({ type: 'sequence', name: 'celebrate' })),
        { dispose: () => { clearTimeout(typingTimer); clearTimeout(typingIdleTimer); clearTimeout(inactivityTimer); } }
    );
    activity();
}

export function deactivate(): void {}
