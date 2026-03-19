import http from 'http';
http.get('http://localhost:3000/', (res) => {
  console.log(res.statusCode);
}).on('error', (err) => console.error(err.message));
