function shortAddr(a) {
  return a ? a.slice(0, 6) + '...' + a.slice(-4) : '-';
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }) : '-';
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function fmtDateTime(d) {
  if (!d) return '-';
  var dt = new Date(d);
  return dt.toLocaleDateString('pt-BR') + ' ' +
    dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
