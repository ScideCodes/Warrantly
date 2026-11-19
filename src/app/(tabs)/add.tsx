import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { FormDone } from '@/components/Dock';
import EditWarranty from '@/app/warranty/edit';

// The dock's Add page: the new-warranty form. A draft survives switching tabs; after saving, the list shows and
// the next visit starts empty.
export default function AddTab() {
  const [round, setRound] = useState(0);
  const done = useCallback(() => {
    setRound((r) => r + 1);
    router.navigate('/');
  }, []);
  return (
    <FormDone.Provider value={done}>
      <EditWarranty key={round} />
    </FormDone.Provider>
  );
}
