const jwt = require('jsonwebtoken');
const fs = require('fs');
const secret = 'reallyreallyreallyreallyverysafeandsecurejwtsecret';
const payload = {
    role: 'anon',
    aud: 'anon',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (100 * 365 * 24 * 60 * 60) // 100 years
};
const token = jwt.sign(payload, secret);
console.log(token);
fs.writeFileSync('token.txt', token);
