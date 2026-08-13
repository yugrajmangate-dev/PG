const fs = require('fs');
function removeConsole(file) {
    let code = fs.readFileSync(file, 'utf8');
    let out = '';
    let i = 0;
    while(i < code.length) {
        let match = code.indexOf('console.log(', i);
        let match2 = code.indexOf('console.warn(', i);
        let match3 = code.indexOf('console.error(', i);
        let next = [match, match2, match3].filter(x => x !== -1).sort((a,b) => a-b)[0];
        
        if (next === undefined) { out += code.slice(i); break; }
        
        out += code.slice(i, next);
        let start = next;
        while(code[start] !== '(') start++;
        
        let openParen = 1;
        let curr = start + 1;
        let inString = false; let stringChar = '';
        while(openParen > 0 && curr < code.length) {
            let char = code[curr];
            if (!inString) {
                if (char === String.fromCharCode(34) || char === String.fromCharCode(39) || char === String.fromCharCode(96)) { inString = true; stringChar = char; }
                else if (char === '(') openParen++;
                else if (char === ')') openParen--;
            } else {
                if (char === '\\\\') curr++; 
                else if (char === stringChar) inString = false;
            }
            curr++;
        }
        
        let end = curr;
        while(end < code.length && (code[end] === ' ' || code[end] === '\t')) end++;
        if (code[end] === ';') end++;
        i = end;
    }
    fs.writeFileSync(file, out);
}
removeConsole('scanner.js');
removeConsole('content.js');
