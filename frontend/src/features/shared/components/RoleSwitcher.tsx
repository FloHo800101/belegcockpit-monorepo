import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Building2, User } from 'lucide-react';

export default function RoleSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const isKanzlei = location.pathname.startsWith('/kanzlei');
  
  const handleSwitch = () => {
    if (isKanzlei) {
      navigate('/mandant');
    } else {
      navigate('/kanzlei');
    }
  };

  return (
    <Button 
      variant="outline" 
      size="sm"
      onClick={handleSwitch}
      className="flex items-center gap-2"
    >
      {isKanzlei ? (
        <>
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">Mandant</span>
        </>
      ) : (
        <>
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline">Kanzlei</span>
        </>
      )}
    </Button>
  );
}
