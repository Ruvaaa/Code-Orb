import * as vscode from 'vscode';

export interface OrbMessage {
    type: 'sequence' | 'idle' | 'ready';
    name?: string;
}

export class OrbViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codeorb.orbView';
    private view: vscode.WebviewView | undefined;
    private queuedMessages: OrbMessage[] = [];

    constructor(private readonly extensionUri: vscode.Uri, private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('codeorb')) {this.postSettings(view);}
        }, undefined, this.context.subscriptions);
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };
        view.webview.html = this.getHtml(view.webview);
        view.webview.onDidReceiveMessage((message: OrbMessage) => {
            if (message.type === 'ready') {
                this.postSettings(view);
                const queued = this.queuedMessages.splice(0);
                queued.forEach(item => void view.webview.postMessage(item));
            }
        }, undefined, this.context.subscriptions);
        view.onDidDispose(() => { if (this.view === view) { this.view = undefined; } }, undefined, this.context.subscriptions);
        view.onDidChangeVisibility(() => {
            void view.webview.postMessage({ type: view.visible ? 'visibility' : 'visibility', visible: view.visible });
        }, undefined, this.context.subscriptions);
    }

    send(message: OrbMessage): void {
        if (!this.view) {
            this.queuedMessages.push(message);
            return;
        }
        void this.view.webview.postMessage(message);
    }

    private postSettings(view: vscode.WebviewView): void {
        const config = vscode.workspace.getConfiguration('codeorb');
        void view.webview.postMessage({
            type: 'settings', enabled: config.get<boolean>('enabled', true), size: config.get<number>('size', 260),
            roam: config.get<boolean>('roam', true), reduceMotion: config.get<boolean>('reduceMotion', false),
            idleBehaviors: config.get<string[]>('idleBehaviors', [])
        });
    }

    private getHtml(webview: vscode.Webview): string {
        const nonce = createNonce();
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
        const framesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'frames.json'));
        const csp = `default-src 'none'; connect-src ${webview.cspSource}; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
        return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><link nonce="${nonce}" rel="stylesheet" href="${styleUri}"><title>Code Orb</title></head>
<body><main id="orb-stage" class="orb-stage" aria-label="Code Orb"><div id="orb" class="orb"><img id="orb-frame" class="is-visible" alt="Code Orb"><img id="orb-frame-next" alt="" aria-hidden="true"></div></main><script nonce="${nonce}">window.__CODEORB__={framesUri:${JSON.stringify(framesUri.toString())},assetRoot:${JSON.stringify(webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media')).toString())}};</script><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
    }
}

function createNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {nonce += chars[Math.floor(Math.random() * chars.length)];}
    return nonce;
}
