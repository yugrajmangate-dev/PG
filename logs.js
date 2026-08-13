document.addEventListener('DOMContentLoaded', () => {
    function loadLogs() {
        chrome.storage.local.get(['detailedLogs'], (result) => {
            const logs = result.detailedLogs || [];
            const logBody = document.getElementById('logBody');
            
            logBody.innerHTML = ''; // Clear current

            if (logs.length === 0) {
                logBody.innerHTML = '<tr><td colspan="4" class="no-logs" style="text-align:center; padding:30px; color:#64748b;">No security threats detected yet. Stay safe!</td></tr>';
                return;
            }

            // Show latest logs first
            logs.reverse().forEach(log => {
                let badgeClass = 'type-badge';
                if (log.type.toLowerCase().includes('aws') || log.type.toLowerCase().includes('key')) badgeClass += ' badge-critical';
                
                const row = `
                    <tr>
                        <td><span style="color:#94a3b8; font-size: 13px;">${log.time}</span></td>
                        <td><span class="${badgeClass}">${log.type.toUpperCase()}</span></td>
                        <td style="color:#e2e8f0; font-weight:500;">${log.platform}</td>
                        <td><span class="status-blocked" style="color: #22c55e; background: rgba(34, 197, 94, 0.1); padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; border: 1px solid rgba(34, 197, 94, 0.2);">🔒 Blocked & Redacted</span></td>
                    </tr>
                `;
                logBody.innerHTML += row;
            });
        });
    }

    loadLogs();

    const btnClearLogs = document.getElementById('btnClearLogs');
    const btnExport = document.getElementById('btnExport');

    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
            if (confirm("Are you sure you want to clear all security logs? This action cannot be undone.")) {
                chrome.storage.local.set({ detailedLogs: [], stats: { total: 0, types: {} } }, () => {
                    loadLogs();
                });
            }
        });
    }

    if (btnExport) {
        btnExport.addEventListener('click', () => {
            chrome.storage.local.get(['detailedLogs'], (result) => {
                const logs = result.detailedLogs || [];
                if (logs.length === 0) {
                    alert("No logs to export.");
                    return;
                }
                const csvContent = "data:text/csv;charset=utf-8,Timestamp,Leak Type,Platform,Status\n" 
                    + logs.map(e => `${e.time},${e.type},${e.platform},Blocked`).join("\n");
                
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", "privacyguard-security-logs.csv");
                document.body.appendChild(link);
                link.click();
                link.remove();
            });
        });
    }
});