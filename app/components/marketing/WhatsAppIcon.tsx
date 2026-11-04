type WhatsAppIconProps = {
  className?: string
}

export function WhatsAppIcon({ className }: WhatsAppIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="https://thesvg.org/icons/whatsapp/default.svg"
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      className={className}
      decoding="async"
    />
  )
}
