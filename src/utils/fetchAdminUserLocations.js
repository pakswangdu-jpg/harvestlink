export async function fetchAllAdminUserLocations(fetchPage) {
  const firstPage = await fetchPage(1);
  const pageCount = Math.ceil(firstPage.total / firstPage.pageSize);
  const users = [...firstPage.users];

  for (let start = 2; start <= pageCount; start += 4) {
    const pages = Array.from(
      { length: Math.min(4, pageCount - start + 1) },
      (_, index) => start + index,
    );
    const results = await Promise.all(pages.map(fetchPage));
    results.forEach((result) => users.push(...result.users));
  }

  return { users, total: firstPage.total };
}
