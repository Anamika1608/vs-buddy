import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface UsageSession {
    startTime: number;
    endTime: number | null;
    date: string;
    duration: number | null;
}

interface UsageData {
    sessions: UsageSession[];
    totalTimeMs: number;
}

let currentSession: UsageSession | null = null;
let globalState: vscode.Memento;

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "vs-buddy" is now active!');
    
    // Store the global state for later use
    globalState = context.globalState;
    
    // Start a new session when the extension activates
    startNewSession();
    
    // Register commands
    const showUsageCommand = vscode.commands.registerCommand('vs-buddy.showUsage', showUsageStats);
    const helloWorldCommand = vscode.commands.registerCommand('vs-buddy.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from VS-Buddy!');
    });
    
    context.subscriptions.push(showUsageCommand, helloWorldCommand);
}

export function deactivate() {
    // End the current session when the extension deactivates
    endCurrentSession();
}

function startNewSession() {
    const now = new Date();
    currentSession = {
        startTime: now.getTime(),
        endTime: null,
        date: now.toISOString().split('T')[0], // YYYY-MM-DD format
        duration: null
    };
}

function endCurrentSession() {
    if (currentSession) {
        const now = new Date();
        currentSession.endTime = now.getTime();
        currentSession.duration = currentSession.endTime - currentSession.startTime;
        
        // Save this session to persistent storage
        saveSession(currentSession);
        currentSession = null;
    }
}

function saveSession(session: UsageSession) {
    const usageData: UsageData = globalState.get('usageData') || { sessions: [], totalTimeMs: 0 };
    
    usageData.sessions.push(session);
    if (session.duration) {
        usageData.totalTimeMs += session.duration;
    }
    
    globalState.update('usageData', usageData);
}

function formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
}

async function showUsageStats() {
    const usageData: UsageData = globalState.get('usageData') || { sessions: [], totalTimeMs: 0 };
    
    // Create WebView panel to display the usage stats
    const panel = vscode.window.createWebviewPanel(
        'vscodeBuddyStats',
        'VS-Buddy Usage Statistics',
        vscode.ViewColumn.One,
        {
            enableScripts: true
        }
    );
    
    // Group sessions by date
    const sessionsByDate = new Map<string, UsageSession[]>();
    for (const session of usageData.sessions) {
        if (!sessionsByDate.has(session.date)) {
            sessionsByDate.set(session.date, []);
        }
        sessionsByDate.get(session.date)?.push(session);
    }
    
    // Calculate total time per day
    const dailyTotals = new Map<string, number>();
    sessionsByDate.forEach((sessions, date) => {
        const totalForDay = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);
        dailyTotals.set(date, totalForDay);
    });
    
    // Generate HTML content
    let tableRows = '';
    const sortedDates = Array.from(dailyTotals.keys()).sort().reverse();
    
    for (const date of sortedDates) {
        const totalForDay = dailyTotals.get(date) || 0;
        const formattedDuration = formatDuration(totalForDay);
        tableRows += `
            <tr>
                <td>${date}</td>
                <td>${formattedDuration}</td>
                <td>${sessionsByDate.get(date)?.length || 0}</td>
            </tr>
        `;
    }
    
    panel.webview.html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VS-Buddy Usage Statistics</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 20px;
                color: var(--vscode-editor-foreground);
                background-color: var(--vscode-editor-background);
            }
            h1, h2 {
                color: var(--vscode-editor-foreground);
            }
            .stats-card {
                background-color: var(--vscode-editor-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 5px;
                padding: 15px;
                margin-bottom: 20px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
            }
            th, td {
                border: 1px solid var(--vscode-panel-border);
                padding: 8px;
                text-align: left;
            }
            th {
                background-color: var(--vscode-editor-lineHighlightBackground);
            }
            .chart-container {
                height: 200px;
                margin: 20px 0;
                position: relative;
            }
            .bar {
                background-color: var(--vscode-button-background);
                position: absolute;
                bottom: 0;
                width: 20px;
                transition: height 0.3s;
            }
        </style>
    </head>
    <body>
        <h1>VS Code Usage Statistics</h1>
        
        <div class="stats-card">
            <h2>Total Usage Time</h2>
            <p>${formatDuration(usageData.totalTimeMs)}</p>
        </div>
        
        <div class="stats-card">
            <h2>Daily Usage</h2>
            <div class="chart-container" id="chart">
                <!-- Chart will be generated by JavaScript -->
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Total Time</th>
                        <th>Sessions</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
        
        <script>
            (function() {
                const chartContainer = document.getElementById('chart');
                const dailyData = ${JSON.stringify(Array.from(dailyTotals.entries()))};
                
                // Find maximum value for scaling
                const maxValue = Math.max(...dailyData.map(d => d[1]));
                
                // Create bars
                dailyData.forEach((dayData, index) => {
                    const date = dayData[0];
                    const value = dayData[1];
                    const percentage = (value / maxValue) * 100;
                    
                    const bar = document.createElement('div');
                    bar.className = 'bar';
                    bar.style.height = percentage + '%';
                    bar.style.left = (index * 30) + 'px';
                    bar.title = date + ': ' + formatDuration(value);
                    
                    chartContainer.appendChild(bar);
                });
                
                function formatDuration(ms) {
                    const seconds = Math.floor(ms / 1000);
                    const minutes = Math.floor(seconds / 60);
                    const hours = Math.floor(minutes / 60);
                    const mins = minutes % 60;
                    const secs = seconds % 60;
                    return hours + 'h ' + mins + 'm ' + secs + 's';
                }
            })();
        </script>
    </body>
    </html>
    `;
}