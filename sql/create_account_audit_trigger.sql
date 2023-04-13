CREATE TRIGGER trig_account_audit
ON Users
AFTER INSERT, DELETE
AS
BEGIN
	SET NOCOUNT ON;
	INSERT INTO
		Account_Audits
			(user_id,
			user_fname,
			user_lname,
			user_email,
			updated_at,
			operation)
	SELECT
		i.user_id,
		i.fname,
		i.lname,
		i.email,
		GETDATE(),
		'INS'
	FROM inserted i

	UNION ALL

	SELECT
		d.user_id,
		d.fname,
		d.lname,
		d.email,
		GETDATE(),
		'DEL'
	FROM deleted d


END;