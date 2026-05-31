import { PageListSkeleton } from '../../components/page-skeleton'

export default function WhatsappTemplatesLoading() {
  return (
    <div dir="rtl" style={{ padding: '32px 40px', maxWidth: 820, margin: '0 auto' }}>
      <PageListSkeleton rows={8} />
    </div>
  )
}
