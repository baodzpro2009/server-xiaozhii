async function getGold() {
  const response = await fetch(process.env.GOLD_API_URL || 'https://taichinh.com/api/v1/gold', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Gold source returned HTTP ${response.status}`);
  return { ...await response.json(), requested_product: 'SJC', attribution: 'taichinh.com; nguồn giá được ghi trong từng mục dữ liệu' };
}

async function getLottery(region = 'mien-bac') {
  if (!process.env.XOSO_API_URL || !process.env.XOSO_API_KEY) {
    const error = new Error('XOSO_API_URL và XOSO_API_KEY chưa được cấu hình'); error.status = 503; throw error;
  }
  const url = new URL(process.env.XOSO_API_URL);
  const key = String(region).trim().toLowerCase();
  const regions = { 'mien-bac': 'MB', 'mien-trung': 'MT', 'mien-nam': 'MN', mb: 'MB', mt: 'MT', mn: 'MN' };
  url.searchParams.set('region', regions[key] || key);
  const response = await fetch(url, { headers: { [process.env.XOSO_API_KEY_HEADER || 'x-api-key']: process.env.XOSO_API_KEY }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Lottery source returned HTTP ${response.status}`);
  return response.json();
}
module.exports = { getGold, getLottery };
