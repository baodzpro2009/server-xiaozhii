const crypto = require('node:crypto');
const { latest } = require('./news');
let cachedItems = [];
let cachedAt = 0;
async function news() {
  if (!cachedAt || Date.now() - cachedAt > 120000) { cachedItems = await latest(); cachedAt = Date.now(); }
  return cachedItems.map(item => ({ ...item, id: crypto.createHash('sha1').update(String(item.link || item.title)).digest('hex').slice(0, 12) }));
}
const stories = [
  { title: 'Chiếc đèn nhỏ', text: 'Một chiếc đèn nhỏ nghĩ rằng ánh sáng của mình chẳng đáng kể. Đêm nọ, cả khu phố mất điện. Ánh đèn ấy soi lối cho một em bé về nhà. Từ đó, chiếc đèn hiểu rằng một việc tốt dù nhỏ cũng có thể giúp được ai đó.' },
  { title: 'Hạt mầm kiên nhẫn', text: 'Một hạt mầm nằm dưới đất nhiều ngày mà chưa thấy nắng. Nó vẫn bám rễ và vươn lên từng chút. Khi mưa đầu mùa đến, hạt mầm trở thành một chồi non. Những điều tốt đẹp đôi khi cần thời gian để lớn lên.' },
  { title: 'Chú chim sẻ và cơn mưa', text: 'Chú chim sẻ trú dưới mái hiên cùng một chú bướm ướt cánh. Chim sẻ nhường chỗ khô nhất cho bạn. Khi trời quang, bướm dẫn sẻ đến vườn hoa nhiều hạt. Hai người bạn cùng chia sẻ niềm vui của mình.' },
];
const tongueTwisters = ['Nồi đồng nấu ốc, nồi đất nấu ếch.', 'Lúa nếp là lúa nếp làng, lúa lên lớp lớp lòng nàng lâng lâng.', 'Con cá rô rúc trong rổ, con cá quả quẫy qua quẫy lại.', 'Trời mưa lâm râm, đường trơn trượt, trâu trở về chuồng.', 'Bà Ba bán bánh bèo bên bờ biển Bình Định.'];
function story(topic = '') { const q = String(topic).trim().toLocaleLowerCase('vi'); return stories.find(x => q && x.title.toLocaleLowerCase('vi').includes(q)) || stories[Math.floor(Math.random() * stories.length)]; }
function wordplay() { return tongueTwisters[crypto.randomInt(tongueTwisters.length)]; }
module.exports = { news, stories, story, wordplay };
