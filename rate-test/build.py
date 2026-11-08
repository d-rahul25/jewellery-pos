"""Inline socket.io-client and pako into template.html -> ../index.html. Usage: python3 rate-test/build.py <node_modules dir>"""
import sys, pathlib
n = pathlib.Path(sys.argv[1]); here = pathlib.Path(__file__).parent
t = (here / 'template.html').read_text()
t = t.replace('/*SOCKETIO*/', (n / 'socket.io-client/dist/socket.io.min.js').read_text().replace('</script', '<\\/script'))
t = t.replace('/*PAKO*/', (n / 'pako/dist/pako_inflate.min.js').read_text().replace('</script', '<\\/script'))
(here.parent / 'rate-test.html').write_text(t)
