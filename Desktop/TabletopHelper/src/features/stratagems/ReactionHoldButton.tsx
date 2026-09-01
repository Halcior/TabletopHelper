type ReactionHoldButtonProps = {
  playerName: string
  disabled?: boolean
  onHold: () => void
}

export function ReactionHoldButton({ playerName, disabled = false, onHold }: ReactionHoldButtonProps) {
  return (
    <button className="reaction-hold-button" disabled={disabled} onClick={onHold}>
      <strong>Hold</strong>
      <span>Stop · {playerName} may react</span>
    </button>
  )
}
