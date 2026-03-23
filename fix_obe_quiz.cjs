const fs = require('fs');
const path = require('path');

const chapter5File = path.join(__dirname, 'src/data/subjects/obe/chapter5/quiz.ts');
let content = fs.readFileSync(chapter5File, 'utf8');

// Replace "chapter": 6 with "chapter": 5
content = content.replace(/"chapter": 6/g, '"chapter": 5');

// Replace "relatedSectionId": "6. with "relatedSectionId": "5.
content = content.replace(/"relatedSectionId": "6\./g, '"relatedSectionId": "5.');

fs.writeFileSync(chapter5File, content);
console.log('Done fixing chapter 5 quiz');
