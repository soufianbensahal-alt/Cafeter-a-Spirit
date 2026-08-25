export const QUICK_LINKS = Object.freeze([
  { name: 'Carta', subtitle: 'viewMenu', icon: 'card', action: 'open-menu' },
  { name: 'WhatsApp', subtitle: 'writeUs', icon: 'whatsapp', href: 'https://api.whatsapp.com/send/?phone=34697721877&text&type=phone_number&app_absent=0' },
  { name: 'Instagram', subtitle: 'followUs', icon: 'camera', href: 'https://www.instagram.com/cafeteriaspirit?igsh=MXBwZ3Y0NnhlNDYxag%3D%3D' },
  { name: 'TikTok', subtitle: 'videos', icon: 'tiktok', href: 'https://www.tiktok.com/@spiritcoffee?_t=8mkgPy4coZF&_r=1' },
  { name: 'Google', subtitle: 'leaveReview', icon: 'star', href: 'https://google.com/maps/place//data=!4m3!3m2!1s0x12a4bdafe69b5aed:0x4b27331104bb0ad2!12e1?source=g.page.m.dd._&laa=lu-desktop-reviews-dialog-review-solicitation' },
  { name: 'Just Eat', subtitle: 'delivery', image: '/assets/just-eat-logo.avif', href: 'https://www.just-eat.es/restaurants-spirit-and-coffee-montcada-i-reixac' },
  { name: 'Uber Eats', subtitle: 'delivery', image: '/assets/uber-eats-logo.png', useAsMask: true, href: 'https://www.ubereats.com/es-en/store/cafeteria-spirit-|-brunch-pancakes-%26-bowls/S3m66DcHSLCtmmwzHhlp7A?diningMode=DELIVERY&pl=JTdCJTIyYWRkcmVzcyUyMiUzQSUyMkNhcnJlciUyMGRlJTIwTW9zcyVDMyVBOG4lMjBBbnRvbiUyQyUyMDU3JTIyJTJDJTIycmVmZXJlbmNlJTIyJTNBJTIyQ2hJSlBXdTY3Qk83cEJJUk5WYXFCeUktLTljJTIyJTJDJTIycmVmZXJlbmNlVHlwZSUyMiUzQSUyMmdvb2dsZV9wbGFjZXMlMjIlMkMlMjJsYXRpdHVkZSUyMiUzQTQxLjQ0NTI5MTk5OTk5OTk5NSUyQyUyMmxvbmdpdHVkZSUyMiUzQTIuMjQ3MDY4NDk5OTk5OTk5NyU3RA%3D%3D' },
  { name: 'Glovo', subtitle: 'delivery', image: '/assets/glovo-logo.svg', iconClass: 'quick-card__icon--glovo', href: 'https://glovoapp.com/es/es/montcada-i-reixach/stores/spirit-and-coffee-montacadaireixach' }
]);

export function renderQuickAccess({ icons, translate }) {
  return `<div class="quick-grid">${QUICK_LINKS.map((item) => {
    const content = `<span class="quick-card__icon ${item.iconClass || ''}">${item.useAsMask ? '<span class="quick-card__uber-mark" aria-hidden="true"></span>' : item.image ? `<img src="${item.image}" alt="" loading="lazy">` : icons[item.icon]}</span><span class="quick-card__copy"><strong>${item.name}</strong><small>${translate(item.subtitle)}</small></span>`;
    return item.action
      ? `<button class="quick-card quick-card--button" type="button" data-action="${item.action}" aria-label="${item.name}: ${translate(item.subtitle)}">${content}</button>`
      : `<a class="quick-card" href="${item.href}" target="_blank" rel="noopener noreferrer" aria-label="${item.name}: ${translate(item.subtitle)}">${content}</a>`;
  }).join('')}</div>`;
}
