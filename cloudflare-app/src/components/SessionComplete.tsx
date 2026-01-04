interface SessionCompleteProps {
  onNewSession: () => void
}

export function SessionComplete({ onNewSession }: SessionCompleteProps) {
  return (
    <div className="complete">
      <div className="complete-message">
        <span className="complete-icon">✨</span>
        <h2>Session Complete</h2>
        <p>Bhavatu Sabba Mangalam</p>
        <p className="translation">May all beings be happy</p>
      </div>
      <button className="start-button" onClick={onNewSession}>
        New Session
      </button>
    </div>
  )
}
