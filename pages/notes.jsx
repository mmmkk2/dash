import { useLocation } from 'react-router-dom'
import NotesApp from '../notes-app'

export default function Notes() {
  const { pathname } = useLocation()
  return <NotesApp initialTab={pathname.startsWith('/notes/calendar') ? 'calendar' : 'memo'} />
}
